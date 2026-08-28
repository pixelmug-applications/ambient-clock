import type { DeviceInfo } from '../types';
import { t } from '../i18n';
import {
  getWebApp,
  hasJeeWebBridge,
  onPixelMugEvent,
  subscribePixelMugEvents,
} from './bubbleClient';
import type { DeviceEventPayload } from './bubbleClient';

export type MpsLaunchPhase = 'requesting' | 'preparing' | 'switching' | 'ready' | 'failed';

const DEV_MPS_ID = import.meta.env.VITE_MPS_ID || '3240349697';
const DEV_MPS_VERSION = import.meta.env.VITE_MPS_VERSION || '0.0.3';
const READY_EVENTS = new Set(['MPS_IS_RUNNING']);
const FAILED_EVENTS = new Set(['INSTALL_FAIL', 'RUNNING_FAIL']);
const lastEvent = new Map<string, string>();
const lastInstallError = new Map<string, string>();
let eventsBound = false;
let pending: {
  key: string;
  resolve: () => void;
  reject: (error: Error) => void;
  timer: number;
  onPhase?: (phase: MpsLaunchPhase) => void;
} | null = null;

export function launchConfig() {
  const query = new URLSearchParams(location.search);
  return {
    id: clean(query.get('mps_id'), DEV_MPS_ID),
    version: clean(query.get('mps_version'), DEV_MPS_VERSION),
  };
}

export async function openMpsApp(
  device: DeviceInfo,
  options: { timeoutMs?: number; onPhase?: (phase: MpsLaunchPhase) => void } = {},
) {
  options.onPhase?.('requesting');
  if (!hasJeeWebBridge()) {
    options.onPhase?.('ready');
    return;
  }

  const config = launchConfig();
  if (!config.id || !config.version) throw new Error(t('launch.missingConfig'));
  bindEvents();
  await subscribePixelMugEvents(device);
  const ready = waitUntilRunning(device, options);
  let response: unknown;
  try {
    response = await getWebApp().callDevice(device, {
      method: 'talMpyExecOneScript',
      params: { id: config.id, version: config.version },
    });
  } catch (error) {
    clearPending();
    options.onPhase?.('failed');
    throw error;
  }

  const code = returnCode(response);
  if (code === 264) {
    clearPending();
    options.onPhase?.('ready');
    return;
  }
  if (code === 263 || code === 265) {
    options.onPhase?.('switching');
  } else if (code === 260 || code === 261 || code === 262) {
    options.onPhase?.('preparing');
  } else {
    clearPending();
    options.onPhase?.('failed');
    throw new Error(t('launch.failed', { code: Number.isFinite(code) ? code : 'unknown' }));
  }

  try {
    await ready;
    options.onPhase?.('ready');
  } catch (error) {
    options.onPhase?.('failed');
    throw error;
  }
}

function bindEvents() {
  if (eventsBound || !hasJeeWebBridge()) return;
  onPixelMugEvent(handleDeviceEvent);
  eventsBound = true;
}

function handleDeviceEvent(envelope: DeviceEventPayload) {
  const source = envelope.payload?.device;
  const key = source ? deviceKey(source) : '';
  for (const item of envelope.payload?.events || []) {
    const method = item.method || item.name;
    const value = String(item.params?.value || '');
    if (method === 'mpyVmError') {
      const code = value.match(/INSTALL_ERROR:([-+]?\d+)/)?.[1] || 'unknown';
      if (key) lastInstallError.set(key, code);
      rejectPending(new Error(t('launch.installFailed', { code })), key);
      continue;
    }
    if (method !== 'mpyVmEvent' || !value) continue;
    if (key) lastEvent.set(key, value);
    if (value === 'INSTALL_START' || value === 'INSTALL_SUCCESS') {
      pending?.onPhase?.('preparing');
    } else if (READY_EVENTS.has(value)) {
      resolvePending(key);
    } else if (FAILED_EVENTS.has(value)) {
      const message = value === 'RUNNING_FAIL'
        ? t('launch.appFailed')
        : t('launch.installFailed', { code: lastInstallError.get(key) || 'unknown' });
      rejectPending(new Error(message), key);
    }
  }
}

function waitUntilRunning(
  device: DeviceInfo,
  options: { timeoutMs?: number; onPhase?: (phase: MpsLaunchPhase) => void },
) {
  const key = deviceKey(device);
  const previous = lastEvent.get(key);
  if (previous && READY_EVENTS.has(previous)) return Promise.resolve();
  if (previous && FAILED_EVENTS.has(previous)) return Promise.reject(new Error(t('launch.deviceFailed')));
  clearPending();
  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      if (pending?.key === key) pending = null;
      reject(new Error(t('launch.timeout')));
    }, options.timeoutMs || 45000);
    pending = { key, resolve, reject, timer, onPhase: options.onPhase };
  });
}

function resolvePending(key = '') {
  if (!pending || (key && pending.key !== key)) return;
  const item = pending;
  pending = null;
  window.clearTimeout(item.timer);
  item.resolve();
}

function rejectPending(error: Error, key = '') {
  if (!pending || (key && pending.key !== key)) return;
  const item = pending;
  pending = null;
  window.clearTimeout(item.timer);
  item.reject(error);
}

function clearPending() {
  if (!pending) return;
  window.clearTimeout(pending.timer);
  pending = null;
}

function returnCode(response: unknown) {
  const data: any = response;
  const result = data?.result;
  const value = typeof result === 'object' && result !== null ? result.value : result ?? data?.value;
  const code = Number(value);
  return Number.isFinite(code) ? code : Number(data?.code);
}

function deviceKey(device: DeviceInfo) {
  const raw = device.raw as any;
  return String(device.deviceId || raw?.device?.id || device.slotId || raw?.slot?.id || `${device.talId || 'device'}:${device.slot || ''}`);
}

function clean(value: string | null, fallback: string) {
  const result = String(value || '').trim();
  return !result || result === 'null' || result === 'undefined' ? fallback : result;
}
