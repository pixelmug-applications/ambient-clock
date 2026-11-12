import time
import audio_service
try:
    import ujson as json
except ImportError:
    import json
try:
    import uos as os
except ImportError:
    import os

import micropyxel as pyxel
import maopaoBle
from maopaoBleApp import BleAppService
from pyxel_prompt_sound import PromptSoundPlayer
from styles.flip import FlipClockStyle
from styles.colorful_digits import ColorfulDigitsClockStyle
from styles.matrix import MatrixClockStyle
from url_player import UrlOggPlayer


APP_NAME = "AmbientClock"
APP_VERSION = "1.0.1"
STATE_PATH = "/ambient_clock.json"
TEMP_PATH = "/ambient_clock.tmp"
FPS = 20
BANK = 0
BLACK = 0
CYAN = 6
WHITE = 7
YELLOW = 10
DEFAULT_TZ_OFFSET_MINUTES = 8 * 60
UNIX_TO_2000 = 946684800
SYNC_APPLY_DELAY_MS = 180
SYNC_TOTAL_MS = 650
SOUND_PRIME_PACKETS = 3
SOUND_PACKETS_PER_UPDATE = 3
TICK_PREROLL_MS = 110
REMOTE_RETRY_MS = 1500

TICK_SOUNDS = {
    "clock-tick-1": ("clock-tick-1.ogg", 1000),
    "clock-tick-2": ("clock-tick-2.ogg", 1000),
    "clock-tick-3": ("clock-tick-3.ogg", 2000),
    "clock-tick-4": ("clock-tick-4.ogg", 1000),
    "clock-tick-5": ("clock-tick-5.ogg", 2000),
    "clock-tick-6": ("clock-tick-6.ogg", 1000),
}
NOISE_SOUNDS = {
    "rain": "rain.ogg",
    "fire": "fire.ogg",
}
STYLE_ALIASES = {
    "flip": "flip",
    "matrix": "matrix",
    "code-rain": "matrix",
    "pixel": "pixel",
    "colorful-digits": "pixel",
}


def ticks_ms():
    return time.ticks_ms()


def ticks_diff(a, b):
    return time.ticks_diff(a, b)


def ticks_add(value, delta):
    return time.ticks_add(value, delta)


def wall_time_ms():
    # Wall-clock time must continue advancing while the VM logical clock is
    # paused with the display off.
    try:
        return time.time_ns() // 1_000_000
    except AttributeError:
        return safe_int(time.time(), 0) * 1000


def safe_int(value, fallback=0):
    try:
        return int(value)
    except Exception:
        return fallback


def clamp(value, low, high):
    return max(low, min(high, value))


def clean_text(value, fallback="", limit=64):
    try:
        text = str(value or "").strip()
    except Exception:
        text = fallback
    return (text or fallback)[:limit]


def device_epoch(unix_seconds):
    try:
        if time.gmtime(0)[0] >= 2000 and unix_seconds >= UNIX_TO_2000:
            return unix_seconds - UNIX_TO_2000
    except Exception:
        pass
    return unix_seconds


def default_config():
    return {
        "v": 1,
        "style": "flip",
        "timezone": "Asia/Shanghai",
        "timezoneOffsetMinutes": DEFAULT_TZ_OFFSET_MINUTES,
        "setAt": 0,
        "sound": {
            "id": "clock-tick-4",
            "name": "Light clock tick",
            "url": "builtin://clock-tick-4",
            "builtin": True,
        },
        "volume": 70,
        "soundSleepMinutes": 0,
    }


def normalize_sound(value):
    if not isinstance(value, dict):
        value = {}
    sound_id = clean_text(value.get("id"), "clock-tick-4", 32)
    if sound_id.endswith(".ogg"):
        sound_id = sound_id[:-4]
    url = clean_text(value.get("url"), "", 256)
    builtin = sound_id in TICK_SOUNDS or sound_id in NOISE_SOUNDS
    custom = (not bool(value.get("builtin", True)) and
              (url.startswith("http://") or url.startswith("https://")))
    if not builtin and not custom:
        sound_id = "off"
        url = "builtin://off"
        builtin = True
    elif builtin:
        url = "builtin://" + sound_id
    return {
        "id": sound_id,
        "name": clean_text(value.get("name"), sound_id, 48),
        "url": url,
        "builtin": builtin,
    }


def normalize_config(value):
    base = default_config()
    if not isinstance(value, dict):
        return base
    style = STYLE_ALIASES.get(clean_text(value.get("style"), "flip", 24), "flip")
    sleep = safe_int(value.get("soundSleepMinutes"), 0)
    if sleep not in (0, 15, 30, 60):
        sleep = 0
    base["style"] = style
    base["timezone"] = clean_text(
        value.get("timezone"), "Asia/Shanghai", 48)
    base["timezoneOffsetMinutes"] = clamp(
        safe_int(value.get("timezoneOffsetMinutes"),
                 DEFAULT_TZ_OFFSET_MINUTES), -720, 840)
    base["setAt"] = max(0, safe_int(value.get("setAt"), 0))
    base["sound"] = normalize_sound(value.get("sound"))
    base["volume"] = clamp(safe_int(value.get("volume"), 70), 0, 100)
    base["soundSleepMinutes"] = sleep
    return base


def load_config():
    try:
        with open(STATE_PATH, "r") as handle:
            value = normalize_config(json.load(handle))
            print("[AmbientClock] restored config")
            return value
    except OSError as exc:
        if getattr(exc, "errno", None) == 2 or "ENOENT" in str(exc):
            print("[AmbientClock] first run; using defaults")
        else:
            print("[AmbientClock] config load failed:", exc)
    except Exception as exc:
        print("[AmbientClock] config load failed:", exc)
    return default_config()


def save_config(value):
    try:
        with open(TEMP_PATH, "w") as handle:
            json.dump(value, handle)
        try:
            os.remove(STATE_PATH)
        except Exception:
            pass
        os.rename(TEMP_PATH, STATE_PATH)
        return True
    except Exception as exc:
        print("[AmbientClock] config save failed:", exc)
        try:
            os.remove(TEMP_PATH)
        except Exception:
            pass
        return False


class AmbientClockApp:
    def __init__(self):
        self.config = load_config()
        self.pending_config = None
        self.syncing = False
        self.sync_started_ms = 0
        self.sync_applied = False

        self.ble = BleAppService(
            APP_NAME, app_version=APP_VERSION, max_message=2048)
        self.ble.command("ambientClockGetState", self.cmd_get_state,
                         priority=1, mutates=False)
        self.ble.command("getState", self.cmd_get_state,
                         priority=1, mutates=False)
        self.ble.config("ambientClock", self.apply_config_transfer)
        self.ble.set_state_provider(self.state_payload)

        self.styles = {
            "flip": FlipClockStyle(BANK),
            "pixel": ColorfulDigitsClockStyle(BANK),
            "matrix": MatrixClockStyle(BANK),
        }
        self.loaded_style = None

        # Difference between the time supplied by the client and the system
        # wall clock. Unlike ticks_ms(), the wall clock advances while MPS is
        # paused, so the displayed time catches up immediately after resume.
        self.wall_time_offset_ms = 0
        self.display_hour = -1
        self.display_minute = -1
        self.prev_hour = 0
        self.prev_minute = 0
        self.hour_flip_frame = FlipClockStyle.FRAMES - 1
        self.minute_flip_frame = FlipClockStyle.FRAMES - 1

        self.audio = audio_service.audio
        self.audio_initialized = False
        self.sound = PromptSoundPlayer(
            audio=self.audio,
            asset_root="assets",
            debug=False,
            log_prefix="[AmbientClockSound]",
            prime_packets=SOUND_PRIME_PACKETS,
            packets_per_update=SOUND_PACKETS_PER_UPDATE,
            stop_handler=self.stop_sound,
        )
        self.url_sound = UrlOggPlayer(
            self.audio,
            volume=self.config.get("volume", 70),
            debug=False,
            audio_state_handler=self.set_audio_initialized,
        )
        self.current_audio_path = None
        self.remote_audio_url = None
        self.remote_retry_at_ms = 0
        self.last_tick_key = None
        self.sound_stop_epoch = 0

        pyxel.init(start_audio=False)
        self.load_style_assets(force=True)
        self.configure_audio(preload=True)
        self.reset_sound_schedule()
        self.draw_boot()
        pyxel.render_graphics()

    def start(self):
        self.ble.start()
        try:
            print("[AmbientClock] BLE scan name:", maopaoBle.device_name())
        except Exception as exc:
            print("[AmbientClock] BLE name unavailable:", exc)
        pyxel.run(self.update, self.draw, fps=FPS, on_exit=self.on_exit)

    def on_exit(self, rt, reason, exc):
        try:
            self.url_sound.deinit()
        except Exception:
            pass
        try:
            self.sound.deinit()
        except Exception:
            pass
        if self.audio_initialized:
            try:
                self.audio.deinit()
            except Exception:
                pass
            self.audio_initialized = False
        try:
            pyxel.destroy()
        except Exception:
            pass
        self.ble.deinit()

    def cmd_get_state(self, params=None, message=None):
        value = self.pending_config if self.pending_config is not None else self.config
        sound = value.get("sound") or {}
        return {
            "ok": True,
            "c": {
                "v": 1,
                "s": value.get("style", "flip"),
                "z": value.get("timezone", "Asia/Shanghai"),
                "o": value.get("timezoneOffsetMinutes", DEFAULT_TZ_OFFSET_MINUTES),
                "a": sound.get("id", "off"),
                "b": 1 if sound.get("builtin", True) else 0,
                "l": value.get("volume", 70),
                "m": value.get("soundSleepMinutes", 0),
            },
        }

    def apply_config_transfer(self, path, meta):
        with open(path, "r") as handle:
            candidate = normalize_config(json.load(handle))
        self.pending_config = candidate
        self.syncing = True
        self.sync_applied = False
        self.sync_started_ms = ticks_ms()
        self.stop_sound()
        self.stop_url_sound()
        print("[AmbientClock] config transfer received")
        return {"ok": True}

    def state_payload(self):
        return {"ok": True, "configured": True}

    def apply_pending_config(self):
        if self.pending_config is None:
            return
        self.config = self.pending_config
        self.pending_config = None

        incoming = safe_int(self.config.get("setAt"), 0)
        if incoming > 0:
            configured_ms = device_epoch(incoming) * 1000
            self.wall_time_offset_ms = configured_ms - wall_time_ms()

        self.loaded_style = None
        self.load_style_assets(force=True)
        self.display_hour = -1
        self.display_minute = -1
        self.hour_flip_frame = FlipClockStyle.FRAMES - 1
        self.minute_flip_frame = FlipClockStyle.FRAMES - 1
        self.configure_audio(preload=False)
        self.reset_sound_schedule()
        saved = save_config(self.config)
        self.sync_applied = True
        print("[AmbientClock] config applied", self.config["style"],
              self.config["sound"]["id"], "saved=", saved)

    def update_sync(self):
        elapsed = ticks_diff(ticks_ms(), self.sync_started_ms)
        if not self.sync_applied and elapsed >= SYNC_APPLY_DELAY_MS:
            self.apply_pending_config()
        if self.sync_applied and elapsed >= SYNC_TOTAL_MS:
            self.syncing = False

    def update(self, rt=None):
        self.ble.poll(budget_ms=2, max_messages=3)
        self.ble.process_pending_config(max_items=1)
        self.sound.update(budget_packets=SOUND_PACKETS_PER_UPDATE)
        self.url_sound.update()

        if self.syncing:
            self.update_sync()
            self.ble.poll(budget_ms=1, max_messages=2)
            return

        self.update_time_state()
        self.update_audio()
        self.ble.poll(budget_ms=1, max_messages=2)

    def draw(self, rt=None):
        if self.syncing:
            self.draw_sync()
            return
        self.load_style_assets()
        pyxel.cls(BLACK)
        self.styles[self.config["style"]].draw(self)

    def draw_boot(self):
        pyxel.cls(BLACK)
        pyxel.text(2, 1, "AMBIENT", CYAN)
        pyxel.text(7, 8, "CLOCK", YELLOW)

    def draw_sync(self):
        pyxel.cls(BLACK)
        text = "sync..."
        pyxel.text(max(0, (32 - len(text) * 4) // 2), 5, text, WHITE)

    def load_style_assets(self, force=False):
        style_id = self.config.get("style", "flip")
        if style_id not in self.styles:
            style_id = "flip"
            self.config["style"] = style_id
        if not force and self.loaded_style == style_id:
            return
        pyxel.images(BANK).cls(BLACK)
        self.styles[style_id].load_assets()
        self.loaded_style = style_id

    def current_utc(self):
        return self.current_utc_ms() // 1000

    def current_utc_ms(self):
        return wall_time_ms() + self.wall_time_offset_ms

    def local_time(self):
        now = self.current_utc() + self.config["timezoneOffsetMinutes"] * 60
        try:
            tm = time.gmtime(now)
        except Exception:
            tm = time.gmtime()
        return tm[3], tm[4], tm[5]

    def update_time_state(self):
        hour, minute, second = self.local_time()
        hour_changed = False
        minute_changed = False
        if self.display_hour < 0 or self.display_minute < 0:
            self.prev_hour = hour
            self.prev_minute = minute
            self.display_hour = hour
            self.display_minute = minute
        else:
            if hour != self.display_hour:
                self.prev_hour = self.display_hour
                self.display_hour = hour
                self.hour_flip_frame = 0
                hour_changed = True
            if minute != self.display_minute:
                self.prev_minute = self.display_minute
                self.display_minute = minute
                self.minute_flip_frame = 0
                minute_changed = True

        if pyxel.frame_count % 2 == 0:
            if not hour_changed and self.hour_flip_frame < FlipClockStyle.FRAMES - 1:
                self.hour_flip_frame += 1
            if not minute_changed and self.minute_flip_frame < FlipClockStyle.FRAMES - 1:
                self.minute_flip_frame += 1

    def clamp_display_value(self, value):
        return clamp(value if value >= 0 else 0, 0, 99)

    def configure_audio(self, preload=False):
        if not self.ensure_audio():
            return False
        try:
            volume = self.config.get("volume", 70)
            self.audio.configure(output_volume=volume, input_gain=1.0)
            self.url_sound.set_volume(volume)
        except Exception as exc:
            print("[AmbientClock] volume configure failed:", exc)
        if preload:
            for path, period in TICK_SOUNDS.values():
                if not self.sound.preload(path):
                    print("[AmbientClock] preload failed:",
                          path, self.sound.last_error)
        return True

    def set_audio_initialized(self, ready):
        self.audio_initialized = bool(ready)

    def ensure_audio(self):
        if self.audio_initialized:
            return True
        try:
            self.audio.init(
                enable_input=False,
                enable_output=True,
                with_opus_encoder=False,
                with_opus_decoder=True,
            )
            self.audio_initialized = True
            return True
        except Exception as exc:
            print("[AmbientClock] audio init failed:", exc)
            return False

    def stop_sound(self, player=None):
        if player is None:
            player = self.sound
        self.current_audio_path = None
        return player.cancel()

    def stop_url_sound(self):
        self.remote_audio_url = None
        self.remote_retry_at_ms = 0
        return self.url_sound.stop()

    def play_asset(self, path, interrupt=True):
        if not self.ensure_audio():
            return False
        ok = self.sound.play(path, interrupt=interrupt)
        if ok:
            self.current_audio_path = path
        else:
            print("[AmbientClock] sound failed:", path, self.sound.last_error)
        return ok

    def reset_sound_schedule(self):
        self.stop_sound()
        self.stop_url_sound()
        self.last_tick_key = None
        sleep_minutes = self.config.get("soundSleepMinutes", 0)
        set_at = self.config.get("setAt", 0)
        if sleep_minutes and set_at:
            self.sound_stop_epoch = (
                device_epoch(set_at) + sleep_minutes * 60)
        elif sleep_minutes:
            self.sound_stop_epoch = (
                self.current_utc() + sleep_minutes * 60)
        else:
            self.sound_stop_epoch = 0

        sound_id = self.config.get("sound", {}).get("id", "off")
        tick = TICK_SOUNDS.get(sound_id)
        if tick:
            period_ms = tick[1]
            self.last_tick_key = (
                self.current_utc_ms() + TICK_PREROLL_MS) // period_ms

    def audio_allowed(self):
        if self.config.get("volume", 0) <= 0:
            return False
        if self.sound_stop_epoch:
            return self.current_utc() < self.sound_stop_epoch
        return True

    def update_audio(self):
        sound = self.config.get("sound") or {}
        sound_id = sound.get("id", "off")
        if not self.audio_allowed():
            if self.sound.is_playing():
                self.stop_sound()
            if self.remote_audio_url is not None or self.url_sound.is_playing():
                self.stop_url_sound()
            return

        url = str(sound.get("url") or "")
        custom_url = (not sound.get("builtin", True) and
                      (url.startswith("http://") or url.startswith("https://")))
        if custom_url:
            if self.sound.is_playing():
                self.stop_sound()
            now = ticks_ms()
            if self.remote_audio_url != url:
                self.stop_url_sound()
                self.remote_audio_url = url
                self.url_sound.start(url)
                self.remote_retry_at_ms = ticks_add(now, REMOTE_RETRY_MS)
            elif (not self.url_sound.is_playing() and
                  ticks_diff(now, self.remote_retry_at_ms) >= 0):
                self.url_sound.start(url)
                self.remote_retry_at_ms = ticks_add(now, REMOTE_RETRY_MS)
            return

        if self.remote_audio_url is not None or self.url_sound.is_playing():
            self.stop_url_sound()

        noise_path = NOISE_SOUNDS.get(sound_id)
        if noise_path:
            if self.current_audio_path != noise_path and self.sound.is_playing():
                self.stop_sound()
            if not self.sound.is_playing():
                self.play_asset(noise_path, interrupt=False)
            return

        tick = TICK_SOUNDS.get(sound_id)
        if not tick:
            if self.sound.is_playing():
                self.stop_sound()
            return

        path, period_ms = tick
        key = (self.current_utc_ms() + TICK_PREROLL_MS) // period_ms
        if self.last_tick_key is None:
            self.last_tick_key = key
            return
        if key != self.last_tick_key:
            self.last_tick_key = key
            self.play_asset(path, interrupt=True)


def appMain():
    AmbientClockApp().start()


if __name__ == "__main__":
    appMain()
