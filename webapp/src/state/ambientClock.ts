import { computed, reactive } from 'vue';
import { BleAppClient } from '../../../../jeejio-bubble/sdk/BleAppClient.js';
import { getWebApp, hasJeeWebBridge, loadPixelMug } from '../template/bubbleClient';
import { openMpsApp } from '../template/mpsLaunch';
import { t } from '../i18n';
import type { AmbientClockConfig, AmbientSound, AppStatus, ClockStyle, DeviceInfo } from '../types';

type LaunchPhase = 'idle' | 'requesting' | 'preparing' | 'switching' | 'ready' | 'failed';

export const CLOCK_STYLES: Array<{ id: ClockStyle; name: string }> = [
  { id: 'flip', name: t('style.flip') },
  { id: 'pixel', name: t('style.pixel') },
  { id: 'matrix', name: t('style.matrix') },
];

export const TIMEZONES = [
  { name: 'Pacific/Honolulu', city: t('city.honolulu') },
  { name: 'America/Los_Angeles', city: t('city.losAngeles') },
  { name: 'America/Denver', city: t('city.denver') },
  { name: 'America/Chicago', city: t('city.chicago') },
  { name: 'America/New_York', city: t('city.newYork') },
  { name: 'America/Sao_Paulo', city: t('city.saoPaulo') },
  { name: 'Europe/London', city: t('city.london') },
  { name: 'Europe/Paris', city: t('city.paris') },
  { name: 'Africa/Cairo', city: t('city.cairo') },
  { name: 'Asia/Dubai', city: t('city.dubai') },
  { name: 'Asia/Kolkata', city: t('city.kolkata') },
  { name: 'Asia/Bangkok', city: t('city.bangkok') },
  { name: 'Asia/Shanghai', city: t('city.shanghai') },
  { name: 'Asia/Tokyo', city: t('city.tokyo') },
  { name: 'Australia/Sydney', city: t('city.sydney') },
  { name: 'Pacific/Auckland', city: t('city.auckland') },
];

export const CLOCK_SOUNDS: AmbientSound[] = [
  { id: 'clock-tick-1', name: t('sound.clockTick1'), url: 'builtin://clock-tick-1', builtin: true },
  { id: 'clock-tick-2', name: t('sound.clockTick2'), url: 'builtin://clock-tick-2', builtin: true },
  { id: 'clock-tick-3', name: t('sound.clockTick3'), url: 'builtin://clock-tick-3', builtin: true },
  { id: 'clock-tick-4', name: t('sound.clockTick4'), url: 'builtin://clock-tick-4', builtin: true },
  { id: 'clock-tick-5', name: t('sound.clockTick5'), url: 'builtin://clock-tick-5', builtin: true },
  { id: 'clock-tick-6', name: t('sound.clockTick6'), url: 'builtin://clock-tick-6', builtin: true },
];

export const NOISE_SOUNDS: AmbientSound[] = [
  { id: 'rain', name: t('sound.rain'), url: 'builtin://rain', builtin: true },
  { id: 'fire', name: t('sound.fire'), url: 'builtin://fire', builtin: true },
];

export const BUILTIN_SOUNDS: AmbientSound[] = [...CLOCK_SOUNDS, ...NOISE_SOUNDS];

const CUSTOM_SOUNDS_KEY = 'ambient-clock.custom-sounds.v1';
const detectedZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai';

const state = reactive({
  status: 'idle' as AppStatus,
  message: '',
  device: null as DeviceInfo | null,
  connection: 'idle',
  launchPhase: 'idle' as LaunchPhase,
  syncing: false,
  style: 'flip' as ClockStyle,
  timezone: TIMEZONES.some((zone) => zone.name === detectedZone) ? detectedZone : 'Asia/Shanghai',
  volume: 70,
  soundSleepMinutes: 30 as 0 | 15 | 30 | 60,
  soundId: 'clock-tick-4',
  customSounds: loadCustomSounds() as AmbientSound[],
});

let client: BleAppClient | null = null;

function protocol() {
  if (!client) {
    client = new BleAppClient(getWebApp().ble, {
      appId: 'AmbientClock',
      appVersion: '1.0.0',
      timeoutMillis: 12000,
      connectTimeoutMillis: 20000,
      readyGraceMillis: 8000,
      retries: 1,
      heartbeatMillis: -1,
    } as Record<string, unknown>);
    client.on('connectionState', (event: any) => {
      state.connection = String(event?.connection || 'unknown');
      if (event?.message) state.message = localizeBleMessage(String(event.message));
      if (state.connection === 'ready') state.status = 'connected';
      if (state.connection === 'failed' || state.connection === 'disconnected') state.status = 'error';
    });
    client.on('data', (event: any) => acceptResponse(event?.message));
  }
  return client;
}

const ready = computed(() => state.connection === 'ready' || !hasJeeWebBridge());
const connecting = computed(() => state.connection === 'connecting' || state.status === 'connecting');
const busy = computed(() =>
  ['loading', 'installing'].includes(state.status) || connecting.value || state.syncing,
);
const selectedSound = computed(() =>
  [...BUILTIN_SOUNDS, ...state.customSounds].find((sound) => sound.id === state.soundId) || BUILTIN_SOUNDS[0],
);
const timezoneOffsetMinutes = computed(() => offsetMinutes(state.timezone, new Date()));
const timezoneOffsetLabel = computed(() => {
  const minutes = timezoneOffsetMinutes.value;
  const sign = minutes >= 0 ? '+' : '-';
  const absolute = Math.abs(minutes);
  return `UTC${sign}${pad2(Math.floor(absolute / 60))}:${pad2(absolute % 60)}`;
});
const openButtonLabel = computed(() => {
  if (busy.value) return state.status === 'connecting' ? t('action.connecting') : t('action.opening');
  if (state.launchPhase === 'failed') return t('action.retry');
  return t('action.openOnPixelMug');
});
const primaryActionLabel = computed(() => {
  if (state.syncing) return t('action.applying');
  if (connecting.value) return t('action.connecting');
  return ready.value ? t('action.applyToPixelMug') : t('action.connectPixelMug');
});
const statusText = computed(() => {
  if (!state.message) return '';
  return hasJeeWebBridge() ? state.message : `${state.message}${t('preview.suffix')}`;
});

export function useAmbientClock() {
  async function openOnDevice() {
    state.status = 'loading';
    state.message = t('status.finding');
    try {
      state.device = state.device || await loadPixelMug();
      if (!state.device) throw new Error(t('status.notFound'));
      state.status = 'installing';
      state.message = t('status.starting');
      await openMpsApp(state.device, { onPhase: updateLaunchPhase });
      state.launchPhase = 'ready';
      state.status = 'ready';
      state.message = t('status.startedConnecting');
      return true;
    } catch (error) {
      state.launchPhase = 'failed';
      state.status = 'error';
      state.message = messageOf(error);
      return false;
    }
  }

  async function connectDevice() {
    try {
      state.device = state.device || await loadPixelMug();
      if (!state.device) throw new Error(t('status.notFound'));
      if (!hasJeeWebBridge()) {
        state.connection = 'ready';
        state.status = 'connected';
        state.message = t('status.connected');
        return true;
      }
      state.status = 'connecting';
      state.connection = 'connecting';
      state.message = t('status.connecting');
      await protocol().ensureConnected(state.device, connectionOptions());
      state.connection = 'ready';
      state.status = 'connected';
      state.message = t('status.connected');
      await pullConfig();
      return true;
    } catch (error) {
      state.connection = 'failed';
      state.status = 'error';
      state.message = messageOf(error);
      return false;
    }
  }

  async function reconnect() {
    if (connecting.value) return false;
    try {
      state.device = state.device || await loadPixelMug();
      if (!state.device) throw new Error(t('status.notFound'));
      if (!hasJeeWebBridge()) return connectDevice();
      state.status = 'connecting';
      state.connection = 'connecting';
      state.message = t('status.connecting');
      await protocol().reconnect(connectionOptions());
      state.connection = 'ready';
      state.status = 'connected';
      state.message = t('status.connected');
      await pullConfig();
      return true;
    } catch (error) {
      state.connection = 'failed';
      state.status = 'error';
      state.message = messageOf(error);
      return false;
    }
  }

  async function pullConfig() {
    if (!state.device || !hasJeeWebBridge()) return;
    const response = await protocol().send(state.device, {
      method: 'ambientClockGetState',
      id: `ambient_get_${Date.now()}`,
      params: { v: 1 },
    }, { priority: 1, timeoutMillis: 6000 });
    acceptResponse(response);
  }

  async function applyToPixelMug() {
    if (!ready.value) return reconnect();
    if (!state.device && hasJeeWebBridge()) return false;
    state.syncing = true;
    state.status = 'syncing';
    state.message = t('status.applying');
    try {
      const config = configPayload();
      if (hasJeeWebBridge() && state.device) {
        await protocol().setConfig('ambientClock', config, {
          device: state.device,
          priority: 1,
          timeoutMillis: 12000,
          commitTimeoutMillis: 12000,
        });
      } else {
        await new Promise((resolve) => window.setTimeout(resolve, 400));
      }
      state.status = 'connected';
      state.message = t('status.applied');
      return true;
    } catch (error) {
      state.status = 'error';
      state.connection = 'failed';
      state.message = messageOf(error);
      return false;
    } finally {
      state.syncing = false;
    }
  }

  function setStyle(style: ClockStyle) {
    state.style = style;
  }

  function setTimezone(timezone: string) {
    state.timezone = timezone;
  }

  function setVolume(value: number) {
    state.volume = Math.max(0, Math.min(100, Math.round(value)));
  }

  function setSleepTimer(value: 0 | 15 | 30 | 60) {
    state.soundSleepMinutes = value;
  }

  function selectSound(id: string) {
    state.soundId = id;
  }

  function addCustomSound(name: string, url: string) {
    const sound: AmbientSound = {
      id: `custom-${Date.now()}`,
      name: name.trim(),
      url: url.trim(),
      builtin: false,
    };
    state.customSounds.push(sound);
    state.soundId = sound.id;
    persistCustomSounds(state.customSounds);
  }

  function updateCustomSound(id: string, name: string, url: string) {
    const index = state.customSounds.findIndex((sound) => sound.id === id);
    if (index < 0) return;
    state.customSounds[index] = {
      ...state.customSounds[index],
      name: name.trim(),
      url: url.trim(),
    };
    persistCustomSounds(state.customSounds);
  }

  function removeCustomSound(id: string) {
    state.customSounds = state.customSounds.filter((sound) => sound.id !== id);
    if (state.soundId === id) state.soundId = 'clock-tick-4';
    persistCustomSounds(state.customSounds);
  }

  return {
    state,
    ready,
    connecting,
    busy,
    selectedSound,
    timezoneOffsetMinutes,
    timezoneOffsetLabel,
    openButtonLabel,
    primaryActionLabel,
    statusText,
    openOnDevice,
    connectDevice,
    reconnect,
    pullConfig,
    applyToPixelMug,
    setStyle,
    setTimezone,
    setVolume,
    setSleepTimer,
    selectSound,
    addCustomSound,
    updateCustomSound,
    removeCustomSound,
  };
}

function configPayload(): AmbientClockConfig {
  return {
    v: 1,
    style: state.style,
    timezone: state.timezone,
    timezoneOffsetMinutes: offsetMinutes(state.timezone, new Date()),
    setAt: Math.floor(Date.now() / 1000),
    sound: { ...selectedSound.value },
    volume: state.volume,
    soundSleepMinutes: state.soundSleepMinutes,
  };
}

function acceptResponse(raw: unknown) {
  const item: any = raw;
  const candidates = [item?.result?.result, item?.result?.message, item?.message, item?.result, item];
  for (const candidate of candidates) {
    const compact = candidate?.c;
    const value = compact?.v === 1
      ? {
          v: 1,
          style: compact.s,
          timezone: compact.z,
          timezoneOffsetMinutes: compact.o,
          sound: { id: compact.a, builtin: compact.b !== 0 },
          volume: compact.l,
          soundSleepMinutes: compact.m,
        }
      : candidate?.config || candidate?.value?.config || candidate?.value || candidate;
    if (value?.v !== 1) continue;
    if (CLOCK_STYLES.some((style) => style.id === value.style)) state.style = value.style;
    if (typeof value.timezone === 'string') state.timezone = value.timezone;
    if (Number.isFinite(Number(value.volume))) state.volume = Math.max(0, Math.min(100, Number(value.volume)));
    if ([0, 15, 30, 60].includes(Number(value.soundSleepMinutes))) {
      state.soundSleepMinutes = Number(value.soundSleepMinutes) as 0 | 15 | 30 | 60;
    }
    if (value.sound?.id) {
      if (!value.sound.builtin && value.sound.url && !state.customSounds.some((sound) => sound.id === value.sound.id)) {
        state.customSounds.push(value.sound as AmbientSound);
        persistCustomSounds(state.customSounds);
      }
      state.soundId = String(value.sound.id);
    }
    return;
  }
}

function updateLaunchPhase(phase: Exclude<LaunchPhase, 'idle'>) {
  state.launchPhase = phase;
  if (phase === 'preparing') state.message = t('status.installing');
  if (phase === 'switching') state.message = t('status.switching');
  if (phase === 'ready') state.message = t('status.started');
}

function connectionOptions() {
  return {
    connectingMessage: t('status.connecting'),
    connectTimeoutMillis: 20000,
    readyGraceMillis: 8000,
    sendTimeoutMillis: 12000,
  };
}

function offsetMinutes(timezone: string, date: Date) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date);
    const pick = (type: string) => Number(parts.find((part) => part.type === type)?.value || 0);
    const asUtc = Date.UTC(pick('year'), pick('month') - 1, pick('day'), pick('hour'), pick('minute'), pick('second'));
    return Math.round((asUtc - date.getTime()) / 60000);
  } catch {
    return 480;
  }
}

function loadCustomSounds(): AmbientSound[] {
  try {
    const value = JSON.parse(localStorage.getItem(CUSTOM_SOUNDS_KEY) || '[]');
    return Array.isArray(value)
      ? value.filter((sound) => sound && !sound.builtin && typeof sound.name === 'string' && typeof sound.url === 'string')
      : [];
  } catch {
    return [];
  }
}

function persistCustomSounds(sounds: AmbientSound[]) {
  try {
    localStorage.setItem(CUSTOM_SOUNDS_KEY, JSON.stringify(sounds));
  } catch {
    // Embedded webviews may disable storage.
  }
}

function localizeBleMessage(message: string) {
  const lower = message.toLowerCase();
  if (lower.includes('timed out') || lower.includes('time out')) return t('ble.connectionTimeout');
  if (lower.includes('disconnect')) return t('ble.disconnected');
  return message;
}

function pad2(value: number) {
  return String(Math.abs(value)).padStart(2, '0');
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : String(error || t('status.unknownError'));
}
