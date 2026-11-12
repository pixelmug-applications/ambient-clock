import gc
import time

try:
    import _thread
except ImportError:
    _thread = None

try:
    import urequests as requests
except ImportError:
    import requests

import audio_service


HTTP_CHUNK_SIZE = 1024
SUPPORTED_FRAME_MS_X10 = (200, 400, 600)
ACTIVE_STATES = ("opening", "buffering", "playing")


def _opus_packet_duration_ms_x10(packet):
    if not packet:
        return 0
    toc = packet[0]
    config = toc >> 3
    code = toc & 3
    if config < 12:
        frame_x10 = (100, 200, 400, 600)[config & 3]
    elif config < 16:
        frame_x10 = (100, 200)[config & 1]
    else:
        frame_x10 = (25, 50, 100, 200)[config & 3]
    if code == 0:
        frames = 1
    elif code == 1 or code == 2:
        frames = 2
    else:
        if len(packet) < 2:
            return 0
        frames = packet[1] & 0x3f
        if frames <= 0:
            return 0
    return frame_x10 * frames


class OggOpusStreamDemuxer:
    def __init__(self, max_header_bytes=65536):
        self.buf = bytearray()
        self.partial = bytearray()
        self.seen_head = False
        self.seen_tags = False
        self.validated = False
        self.error = None
        self.sample_rate = 16000
        self.channels = 0
        self.frame_ms = 60
        self.bytes_seen = 0
        self.max_header_bytes = int(max_header_bytes)

    def feed(self, data):
        if self.error:
            return ()
        if data:
            self.buf.extend(data)
            self.bytes_seen += len(data)
        packets = []
        while True:
            if len(self.buf) < 27:
                break
            if self.buf[0:4] != b"OggS":
                pos = self.buf.find(b"OggS")
                if pos < 0:
                    keep = self.buf[-3:] if len(self.buf) > 3 else self.buf
                    self.buf = bytearray(keep)
                    break
                if pos > 0:
                    self.buf = bytearray(self.buf[pos:])
                if len(self.buf) < 27:
                    break
            version = self.buf[4]
            if version != 0:
                self.error = "bad ogg version: %d" % version
                break
            header_type = self.buf[5]
            seg_count = self.buf[26]
            header_len = 27 + seg_count
            if len(self.buf) < header_len:
                break
            body_size = 0
            for index in range(seg_count):
                body_size += self.buf[27 + index]
            page_size = header_len + body_size
            if len(self.buf) < page_size:
                break
            segments = self.buf[27:header_len]
            body = self.buf[header_len:page_size]
            continued = (header_type & 0x01) != 0
            packet = self.partial if continued and len(self.partial) else bytearray()
            self.partial = bytearray()
            cursor = 0
            for length in segments:
                if length:
                    packet.extend(body[cursor:cursor + length])
                cursor += length
                if length < 255:
                    if len(packet):
                        result = self._handle_packet(packet)
                        if result is not None:
                            packets.append(result)
                    packet = bytearray()
            if len(packet):
                self.partial = packet
            self.buf = bytearray(self.buf[page_size:])
        if (not self.validated and self.bytes_seen > self.max_header_bytes
                and not self.error):
            self.error = "missing opus headers"
        return packets

    def _handle_packet(self, packet):
        if not self.seen_head:
            if len(packet) < 19 or packet[:8] != b"OpusHead":
                self.error = "missing OpusHead"
                return None
            version = packet[8]
            channels = packet[9]
            sample_rate = (packet[12] | (packet[13] << 8) |
                           (packet[14] << 16) | (packet[15] << 24))
            mapping_family = packet[18]
            if version > 15:
                self.error = "bad opus version: %d" % version
                return None
            # The Audio Service decoder renders one output channel. Standard
            # mapping-family-0 stereo Opus is downmixed to mono by libopus.
            if channels != 1 and channels != 2:
                self.error = "unsupported channel count: %d" % channels
                return None
            if mapping_family != 0:
                self.error = "unsupported channel mapping: %d" % mapping_family
                return None
            # OpusHead input sample rate is informational. The Opus decoder
            # always renders through the 48 kHz output player, so do not
            # reject streams based on the recorded source rate (e.g. 44100).
            self.channels = channels
            self.sample_rate = sample_rate
            self.seen_head = True
            return None
        if not self.seen_tags:
            if len(packet) < 8 or packet[:8] != b"OpusTags":
                self.error = "missing OpusTags"
                return None
            self.seen_tags = True
            return None
        if not self.validated:
            duration_x10 = _opus_packet_duration_ms_x10(packet)
            if duration_x10 not in SUPPORTED_FRAME_MS_X10:
                self.error = "unsupported opus frame duration: %.1fms" % (duration_x10 / 10)
                return None
            self.frame_ms = duration_x10 // 10
            self.validated = True
        return bytes(packet)


class UrlOggPlayer:
    def __init__(self, audio, volume=70, debug=False, audio_state_handler=None):
        self.audio = audio
        self.volume = int(volume)
        self.debug = bool(debug)
        self.audio_state_handler = audio_state_handler
        self.state = "idle"
        self.error = None
        self.url = None
        self.response = None
        self.player = None
        self.session = None
        self.run_id = 0
        self.stop_requested = True

    def _log(self, *items):
        if not self.debug:
            return
        try:
            print("[AmbientClockUrl]", *items)
        except Exception:
            pass

    def _set_state(self, state, error=None):
        self.state = state
        self.error = error
        if error:
            try:
                print("[AmbientClockUrl]", state, error)
            except Exception:
                pass
        else:
            self._log(state)

    def set_volume(self, volume):
        self.volume = max(0, min(100, int(volume)))
        try:
            self.audio.configure(output_volume=self.volume)
        except Exception:
            pass

    def is_playing(self):
        return self.state in ACTIVE_STATES

    def start(self, url):
        url = str(url or "").strip()
        if not (url.startswith("http://") or url.startswith("https://")):
            self._set_state("error", "invalid http url")
            return False
        if _thread is None:
            self._set_state("error", "network audio requires _thread")
            return False
        if self.url == url and self.is_playing():
            return True
        self.stop()
        self.run_id += 1
        run_id = self.run_id
        self.stop_requested = False
        self.url = url
        self._set_state("opening")
        try:
            _thread.start_new_thread(self._worker, (run_id, url))
            return True
        except Exception as exc:
            self.stop_requested = True
            self._set_state("error", repr(exc))
            return False

    def stop(self):
        self.stop_requested = True
        self.run_id += 1
        response = self.response
        player = self.player
        session = self.session
        self.response = None
        self.player = None
        self.session = None
        if response is not None:
            try:
                response.close()
            except Exception:
                pass
        if session is not None:
            try:
                session.cancel()
            except Exception:
                pass
        self.url = None
        self._set_state("stopped")
        return True

    def update(self):
        try:
            self.audio.poll()
        except Exception:
            pass

    def deinit(self):
        self.stop()

    def _active(self, run_id):
        return not self.stop_requested and run_id == self.run_id

    def _open_response(self, url):
        try:
            return requests.get(url, stream=True, timeout=8)
        except TypeError:
            try:
                return requests.get(url, stream=True)
            except TypeError:
                return requests.get(url)

    def _stream(self, response):
        raw = getattr(response, "raw", None)
        return raw if raw is not None else response

    def _set_audio_ready(self, ready):
        if self.audio_state_handler is None:
            return
        try:
            self.audio_state_handler(bool(ready))
        except Exception:
            pass

    def _open_audio(self, frame_ms):
        # The network worker owns the active output stream. Reset the shared
        # service after the local prompt stream has been cancelled, then
        # initialize it in this worker just like audio-visualizer does.
        try:
            self.audio.deinit()
        except Exception:
            pass
        self._set_audio_ready(False)
        self.audio.init(
            enable_input=False,
            enable_output=True,
            with_opus_encoder=False,
            with_opus_decoder=True,
        )
        self._set_audio_ready(True)
        self.audio.configure(output_volume=self.volume)
        try:
            player = audio_service.Player(
                self.audio, "opus", 48000, int(frame_ms))
        except Exception:
            # Keep this fallback identical to audio-visualizer. Some firmware
            # builds only accept the codec argument on audio.player().
            player = self.audio.player("opus")
        return player, player.open_stream(mode="replace")

    def _write_packet(self, run_id, session, packet):
        while self._active(run_id):
            try:
                session.write(packet, wait=False)
                return True
            except OSError:
                try:
                    self.audio.poll()
                except Exception:
                    pass
                time.sleep_ms(3)
            except Exception as exc:
                self._set_state("error", repr(exc))
                return False
        return False

    def _worker(self, run_id, url):
        response = None
        player = None
        session = None
        try:
            demux = OggOpusStreamDemuxer()
            response = self._open_response(url)
            if self._active(run_id):
                self.response = response
            status = getattr(response, "status_code", getattr(response, "status", 200))
            try:
                status = int(status)
            except Exception:
                status = 200
            if status < 200 or status >= 300:
                self._set_state("error", "HTTP %d" % status)
                return
            stream = self._stream(response)
            self._set_state("buffering")
            while self._active(run_id):
                chunk = stream.read(HTTP_CHUNK_SIZE)
                if not chunk:
                    break
                packets = demux.feed(chunk)
                if demux.error:
                    self._set_state("error", demux.error)
                    return
                if demux.validated and session is None:
                    player, session = self._open_audio(demux.frame_ms)
                    if self._active(run_id):
                        # Player owns the decoder/output resources. Holding only
                        # the stream session lets Player be garbage-collected,
                        # which silently stops output while HTTP keeps reading.
                        self.player = player
                        self.session = session
                    print("[AmbientClockUrl] opus playing", demux.sample_rate,
                          "Hz", demux.frame_ms, "ms")
                    self._set_state("playing")
                for packet in packets:
                    if session is None or not self._write_packet(run_id, session, packet):
                        return
                try:
                    self.audio.poll()
                except Exception:
                    pass
            if self._active(run_id) and session is not None:
                try:
                    session.end()
                    session.drain(1000)
                except Exception:
                    pass
                self._set_state("ended")
            elif self._active(run_id):
                self._set_state("error", demux.error or "no playable opus packets")
        except Exception as exc:
            if self._active(run_id):
                self._set_state("error", repr(exc))
        finally:
            if response is not None:
                try:
                    response.close()
                except Exception:
                    pass
            if run_id == self.run_id:
                self.response = None
                self.session = None
                self.player = None
            try:
                gc.collect()
            except Exception:
                pass