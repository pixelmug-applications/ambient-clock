import { computed, reactive } from 'vue';
import type { DeviceInfo } from '../types';
import { getWebApp, hasJeeWebBridge } from './bubbleClient';

type BlePayload = Record<string, unknown>;

const READY_STATE = 'ready';
const READY_STATES = new Set(['ready', 'connected']);
const UNAVAILABLE_STATES = new Set(['disconnected', 'failed']);
const ACK_READY_GRACE_MS = 1200;
const BLE_CONNECT_TIMEOUT_MS = 15000;
const BLE_CONNECT_TIMEOUT_MESSAGE = 'connecting ble time out.';
const BLE_CONNECTING_MESSAGE = 'Connecting BLE...';
const BLE_DISCONNECTED_MESSAGE = 'BLE disconnected.';
const PROBE_TIMEOUT_MS = 1200;

const state = reactive({
  connection: 'idle',
  message: '',
  lastError: '',
});

let currentDevice: DeviceInfo | null = null;
let connecting: Promise<unknown> | null = null;
let connectAttemptId = 0;

const isReady = computed(() => state.connection === READY_STATE || !hasJeeWebBridge());
const isConnecting = computed(() => state.connection === 'connecting' || Boolean(connecting));
const isUnavailable = computed(() => UNAVAILABLE_STATES.has(state.connection));

export function useBleSession() {
  async function ensureConnected(device: DeviceInfo) {
    currentDevice = device;
    if (!hasJeeWebBridge()) {
      state.connection = READY_STATE;
      state.message = 'BLE mock connected.';
      return;
    }
    if (state.connection === READY_STATE) return;
    if (connecting) return connecting;

    const attemptId = ++connectAttemptId;
    state.connection = 'connecting';
    state.message = BLE_CONNECTING_MESSAGE;
    state.lastError = '';

    connecting = withTimeout(
      runConnectAttempt(device, attemptId),
      BLE_CONNECT_TIMEOUT_MS,
      BLE_CONNECT_TIMEOUT_MESSAGE,
      () => {
        if (attemptId !== connectAttemptId) return;
        connecting = null;
        markConnectFailed(new Error(BLE_CONNECT_TIMEOUT_MESSAGE));
      },
    )
      .catch((error) => {
        if (attemptId === connectAttemptId) {
          connecting = null;
          markConnectFailed(error);
        }
        throw error;
      })
      .finally(() => {
        if (attemptId === connectAttemptId) {
          connecting = null;
        }
      });

    return connecting;
  }

  async function reconnect() {
    if (!currentDevice) return;
    connectAttemptId += 1;
    connecting = null;
    state.connection = 'idle';
    await ensureConnected(currentDevice);
  }

  function resetConnection() {
    connectAttemptId += 1;
    connecting = null;
    currentDevice = null;
    state.connection = 'idle';
    state.message = '';
    state.lastError = '';
  }

  async function send(device: DeviceInfo, payload: BlePayload, options: Record<string, unknown> = {}) {
    await ensureConnected(device);

    if (!hasJeeWebBridge()) {
      return { code: 200, result: payload, mock: true };
    }

    try {
      return await getWebApp().ble!.send(device, payload, {
        writeType: 'withResponse',
        timeoutMillis: 5000,
        ...options,
      });
    } catch (error) {
      state.connection = 'failed';
      state.lastError = errorMessage(error);
      state.message = state.lastError;
      throw error;
    }
  }

  function bindState() {
    if (!hasJeeWebBridge()) return () => undefined;
    const listener = (event: { state?: string; data?: string }) => {
      const next = normalizeConnectionState(event.state || event.data || 'unknown');
      if (state.connection === READY_STATE && (next === 'idle' || next === 'unknown')) {
        return;
      }
      if (next === 'connecting' && !connecting) {
        return;
      }
      state.connection = next;
      if (next === READY_STATE) {
        state.message = 'BLE connected.';
        state.lastError = '';
      } else if (UNAVAILABLE_STATES.has(next)) {
        state.message = 'PixelMug disconnected.';
      } else if (state.connection !== 'connecting' && !connecting) {
        state.message = BLE_DISCONNECTED_MESSAGE;
      }
    };

    getWebApp().ble!.onState(listener);
    return () => {
      getWebApp().ble!.off('state', listener);
    };
  }

  function bindData(handler: (event: { message?: unknown; text?: string; raw?: unknown }) => void) {
    if (!hasJeeWebBridge()) return () => undefined;
    const ble = getWebApp().ble! as unknown as {
      onData(listener: (event: { message?: unknown; text?: string; raw?: unknown }) => void): void;
      off(event: string, listener: (event: { message?: unknown; text?: string; raw?: unknown }) => void): void;
    };
    ble.onData(handler);
    return () => {
      ble.off('data', handler);
    };
  }

  return {
    state,
    isReady,
    isConnecting,
    isUnavailable,
    bindState,
    bindData,
    ensureConnected,
    reconnect,
    resetConnection,
    send,
  };
}

async function runConnectAttempt(device: DeviceInfo, attemptId: number) {
  if (await probeExistingConnection(device)) {
    markConnectReady(attemptId);
    return { state: READY_STATE, reused: true };
  }

  const result = await getWebApp().ble!.connect(device, {
    timeoutSeconds: BLE_CONNECT_TIMEOUT_MS / 1000,
    waitForReady: false,
  });
  const bridgeState = await waitForBridgeState(ACK_READY_GRACE_MS);
  if (bridgeState && UNAVAILABLE_STATES.has(bridgeState)) {
    throw new Error(`BLE ${bridgeState}`);
  }
  markConnectReady(attemptId);
  return result;
}

function markConnectReady(attemptId: number) {
  if (attemptId !== connectAttemptId) return;
  state.connection = READY_STATE;
  state.message = 'BLE connected.';
  state.lastError = '';
}

function markConnectFailed(error: unknown) {
  state.connection = 'failed';
  state.lastError = errorMessage(error);
  state.message = state.lastError;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error || 'Unknown error');
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string, onTimeout?: () => void) {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      onTimeout?.();
      reject(new Error(message));
    }, timeoutMs);

    promise
      .then((value) => {
        window.clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        window.clearTimeout(timer);
        reject(error);
      });
  });
}

function normalizeConnectionState(value: string) {
  return READY_STATES.has(value) ? READY_STATE : value;
}

async function probeExistingConnection(device: DeviceInfo) {
  try {
    await getWebApp().ble!.send(device, {
      method: 'mpyPing',
      id: `ping_${Date.now()}`,
    }, {
      writeType: 'withResponse',
      timeoutMillis: PROBE_TIMEOUT_MS,
    });
    return true;
  } catch {
    return false;
  }
}

function waitForBridgeState(timeoutMs: number) {
  const ble = getWebApp().ble!;
  const current = normalizeConnectionState(String((ble as { state?: string }).state || 'unknown'));
  if (current === READY_STATE || UNAVAILABLE_STATES.has(current)) {
    return Promise.resolve(current);
  }

  return new Promise<string | null>((resolve) => {
    let done = false;
    const cleanup = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      ble.off('state', listener);
    };
    const listener = (event: { state?: string; data?: string }) => {
      const next = normalizeConnectionState(event.state || event.data || 'unknown');
      if (next === READY_STATE || UNAVAILABLE_STATES.has(next)) {
        cleanup();
        resolve(next);
      }
    };
    const timer = setTimeout(() => {
      cleanup();
      resolve(null);
    }, timeoutMs);

    ble.onState(listener);
  });
}
