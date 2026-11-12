import json

import maopaoBle


ACTIVE_MANAGER = None


@maopaoBle.on_connect
def _handle_connect(conn):
    if ACTIVE_MANAGER is not None:
        ACTIVE_MANAGER._on_connect(conn)


@maopaoBle.on_disconnect
def _handle_disconnect(conn, reason):
    if ACTIVE_MANAGER is not None:
        ACTIVE_MANAGER._on_disconnect(conn, reason)


@maopaoBle.on_receive
def _handle_receive(conn, data):
    if ACTIVE_MANAGER is not None:
        ACTIVE_MANAGER._on_receive(conn, data)


@maopaoBle.on_error
def _handle_error(err):
    if ACTIVE_MANAGER is not None:
        ACTIVE_MANAGER._on_error(err)


class WebAppBleManager:
    def __init__(self, app_name="MPS", on_message=None):
        self.app_name = app_name
        self.on_message = on_message
        self.conn = None
        self.connected = False
        self.last_error = None

    def start(self):
        global ACTIVE_MANAGER

        ACTIVE_MANAGER = self
        maopaoBle.init(auto_restart_advertising=True, auto_start_advertising=True)
        print("[%s] advertising as:" % self.app_name, maopaoBle.device_name())

    def poll(self):
        maopaoBle.poll()
        self.ensure_advertising()

    def deinit(self):
        global ACTIVE_MANAGER

        if ACTIVE_MANAGER is self:
            ACTIVE_MANAGER = None
        self.conn = None
        self.connected = False
        try:
            maopaoBle.deinit()
        except Exception:
            pass

    def ensure_advertising(self):
        try:
            if not maopaoBle.is_connected() and not maopaoBle.is_advertising():
                maopaoBle.start_advertising()
        except Exception as exc:
            self.last_error = exc

    def reply(self, request_id, ok, error=None, conn=None):
        payload = {"ok": ok}
        if request_id is not None:
            payload["id"] = request_id
        if error:
            payload["error"] = error
        self.send(payload, conn=conn)

    def send(self, payload, conn=None):
        target_conn = conn or self.conn
        try:
            data = payload if isinstance(payload, str) else json.dumps(payload)
            maopaoBle.send(data, conn=target_conn)
            return True
        except Exception as exc:
            self.last_error = exc
            print("[%s] BLE send failed:" % self.app_name, exc)
            return False

    def _on_connect(self, conn):
        self.conn = conn
        self.connected = True
        print("[%s] BLE connected:" % self.app_name, conn.addr_str)

    def _on_disconnect(self, conn, reason):
        if self.conn == conn:
            self.conn = None
        self.connected = False
        print("[%s] BLE disconnected:" % self.app_name, reason)
        self.ensure_advertising()

    def _on_receive(self, conn, data):
        self.conn = conn
        self.connected = True
        if self.on_message is not None:
            self.on_message(conn, self._decode(data))

    def _on_error(self, err):
        self.last_error = err
        print("[%s] BLE error:" % self.app_name, err)

    def _decode(self, data):
        if isinstance(data, bytes):
            text = data.decode("utf-8")
        else:
            text = str(data)
        return json.loads(text)
