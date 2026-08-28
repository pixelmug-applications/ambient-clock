export type DeviceInfo = {
  name?: string;
  talId?: string;
  deviceTalId?: string;
  slot?: string | number;
  slotId?: string;
  deviceId?: string;
  online?: boolean;
  raw?: unknown;
};

export type ClockStyle = 'flip' | 'matrix' | 'pixel';
export type AppStatus = 'idle' | 'loading' | 'ready' | 'installing' | 'connecting' | 'connected' | 'syncing' | 'error';

export type AmbientSound = {
  id: string;
  name: string;
  url: string;
  builtin: boolean;
};

export type AmbientClockConfig = {
  v: 1;
  style: ClockStyle;
  timezone: string;
  timezoneOffsetMinutes: number;
  setAt: number;
  sound: AmbientSound;
  volume: number;
  soundSleepMinutes: 0 | 15 | 30 | 60;
};