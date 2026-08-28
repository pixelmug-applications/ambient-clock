declare module '../../../../jeejio-bubble/sdk/WebApp.js' {
  export class BubbleWebApp {
    constructor(options?: Record<string, unknown>);
    ble: any;
    getDevice?(options?: Record<string, unknown>): Promise<unknown>;
    getDevices(): Promise<unknown>;
    subscribeDeviceEvents(device: unknown): Promise<unknown>;
    onDeviceEvent(handler: (event: unknown) => void): void;
    callDevice(device: unknown, rpc: unknown): Promise<unknown>;
  }
}

declare module '../../../../jeejio-bubble/sdk/BleAppClient.js' {
  export class BleAppClient {
    constructor(ble: unknown, options?: Record<string, unknown>);
    on(type: string, handler: (event: any) => void): this;
    ensureConnected(device: unknown, options?: Record<string, unknown>): Promise<unknown>;
    reconnect(options?: Record<string, unknown>): Promise<unknown>;
    send(device: unknown, payload: unknown, options?: Record<string, unknown>): Promise<unknown>;
    setConfig(name: string, value: unknown, options?: Record<string, unknown>): Promise<unknown>;
  }
}