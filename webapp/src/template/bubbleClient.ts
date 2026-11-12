import { BubbleWebApp } from '@jeejio-bubble/bot/sdk/WebApp.js';
import type { DeviceInfo } from '../types';

export type DeviceEventItem = {
  method?: string;
  name?: string;
  params?: { value?: unknown };
};

export type DeviceEventPayload = {
  payload?: {
    device?: DeviceInfo;
    events?: DeviceEventItem[];
  };
};

let webapp: BubbleWebApp | null = null;

export function hasJeeWebBridge() {
  return Boolean((globalThis as { JeeWeb?: unknown }).JeeWeb);
}

export function getWebApp() {
  if (!webapp) {
    webapp = new BubbleWebApp({ debug: import.meta.env.DEV, timeoutMillis: 20000 });
  }
  return webapp;
}

export async function loadPixelMug(): Promise<DeviceInfo | null> {
  if (!hasJeeWebBridge()) {
    return { name: 'PixelMug S1 Mock', talId: 'PixelMugS1', slotId: 'mock', online: true };
  }

  const api = getWebApp() as BubbleWebApp & {
    getDevice?: (options?: Record<string, unknown>) => Promise<unknown>;
  };
  if (typeof api.getDevice === 'function') {
    const result: any = await api.getDevice({ talId: 'PixelMugS1' });
    const found = (result?.result || result?.device || result) as DeviceInfo;
    if (found && (found.talId || found.deviceTalId) === 'PixelMugS1') return found;
  }

  const devices = await getWebApp().getDevices() as DeviceInfo[];
  return devices.find((item) => (item.talId || item.deviceTalId) === 'PixelMugS1') || null;
}

export async function subscribePixelMugEvents(device: DeviceInfo) {
  if (hasJeeWebBridge()) await getWebApp().subscribeDeviceEvents(device);
}

export function onPixelMugEvent(handler: (event: DeviceEventPayload) => void) {
  if (!hasJeeWebBridge()) return () => undefined;
  getWebApp().onDeviceEvent((event: unknown) => handler(event as DeviceEventPayload));
  return () => undefined;
}
