<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { COLOR_THUMB_IMAGE, FLIP_THUMB_IMAGE, PIXELMUG_ICON } from '../assets';
import { currentLocale, t } from '../i18n';
import { CLOCK_SOUNDS, CLOCK_STYLES, NOISE_SOUNDS, TIMEZONES, useAmbientClock } from '../state/ambientClock';
import type { AmbientSound, ClockStyle } from '../types';

type Tab = 'clock' | 'sound';
type Sheet = 'timezone' | 'addSound' | null;

const store = useAmbientClock();
const tab = ref<Tab>('clock');
const sheet = ref<Sheet>(null);
const zoneSearch = ref('');
const soundName = ref('');
const soundUrl = ref('');
const editingSoundId = ref<string | null>(null);
const formError = ref('');
const now = ref(new Date());
const bleSeconds = ref(20);
const timer = window.setInterval(() => now.value = new Date(), 1000);
let bleCountdownTimer = 0;

const displayTime = computed(() => new Intl.DateTimeFormat(currentLocale, {
  timeZone: store.state.timezone,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
}).format(now.value));

const bleLabel = computed(() => {
  if (store.ready.value) return t('ble.connected');
  if (store.connecting.value) return t('ble.connectingSeconds', { seconds: bleSeconds.value });
  if (store.state.connection === 'failed') return t('ble.timeout');
  return t('ble.connect');
});
const canReconnect = computed(() => !store.ready.value && !store.connecting.value);

const filteredZones = computed(() => {
  const query = zoneSearch.value.trim().toLowerCase();
  return TIMEZONES.filter((zone) =>
    !query || zone.name.toLowerCase().includes(query) || zone.city.toLowerCase().includes(query),
  );
});

watch(
  () => store.connecting.value,
  (connecting) => {
    window.clearInterval(bleCountdownTimer);
    bleSeconds.value = 20;
    if (!connecting) return;
    bleCountdownTimer = window.setInterval(() => {
      bleSeconds.value = Math.max(0, bleSeconds.value - 1);
    }, 1000);
  },
  { immediate: true },
);

watch(
  () => store.ready.value,
  (ready) => {
    if (!ready) sheet.value = null;
  },
);

onBeforeUnmount(() => {
  window.clearInterval(timer);
  window.clearInterval(bleCountdownTimer);
});

function chooseTimezone(name: string) {
  store.setTimezone(name);
  sheet.value = null;
  zoneSearch.value = '';
}

function openAddSound() {
  editingSoundId.value = null;
  soundName.value = '';
  soundUrl.value = '';
  formError.value = '';
  sheet.value = 'addSound';
}

function openEditSound(sound: AmbientSound) {
  editingSoundId.value = sound.id;
  soundName.value = sound.name;
  soundUrl.value = sound.url;
  formError.value = '';
  sheet.value = 'addSound';
}

function saveSound() {
  const name = soundName.value.trim();
  const url = soundUrl.value.trim();
  if (!name) {
    formError.value = t('sound.nameRequired');
    return;
  }
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error();
  } catch {
    formError.value = t('sound.urlInvalid');
    return;
  }
  if (editingSoundId.value) {
    store.updateCustomSound(editingSoundId.value, name, url);
  } else {
    store.addCustomSound(name, url);
  }
  editingSoundId.value = null;
  sheet.value = null;
}

function thumbClass(style: ClockStyle) {
  return ['clock-preview', `preview-${style}`];
}

function sleepLabel(value: number) {
  if (value === 0) return t('sound.off');
  if (value === 60) return t('sound.oneHour');
  return t('sound.minutes', { minutes: value });
}
</script>

<template>
  <main class="ambient-page" :class="{ offline: !store.ready.value }">
    <section class="ambient-content">
      <template v-if="tab === 'clock'">
        <header class="pixel-title">
          <span class="title-icon clock-face" aria-hidden="true">◷</span>
          <h1><i>+</i> {{ t('clock.title') }} <i>+</i></h1>
          <button
            class="header-ble-control"
            :class="{ connected: store.ready.value, connecting: store.connecting.value, failed: store.state.connection === 'failed' }"
            :disabled="!canReconnect"
            @click="store.reconnect"
          ><i />{{ bleLabel }}</button>
        </header>

        <section class="timezone-card">
          <div class="zone-summary">
            <span class="globe" aria-hidden="true">🌍</span>
            <div>
              <small>{{ t('timezone.current') }}</small>
              <strong>{{ store.state.timezone }}</strong>
              <span>{{ store.timezoneOffsetLabel.value }}</span>
            </div>
          </div>
          <button class="zone-action" :disabled="!store.ready.value" @click="sheet = 'timezone'">
            <b>{{ t('timezone.chooseOther') }}</b><span>›</span>
          </button>
        </section>

        <h2 class="section-title"><span>☆</span> {{ t('clock.styles') }}</h2>
        <section class="clock-grid">
          <button
            v-for="style in CLOCK_STYLES"
            :key="style.id"
            class="clock-style-card"
            :class="{ selected: store.state.style === style.id }"
            :disabled="!store.ready.value"
            @click="store.setStyle(style.id)"
          >
            <div :class="thumbClass(style.id)">
              <img v-if="style.id === 'flip'" :src="FLIP_THUMB_IMAGE" alt="" />
              <img v-else-if="style.id === 'pixel'" :src="COLOR_THUMB_IMAGE" alt="" />
              <template v-else-if="style.id === 'matrix'">
                <span class="matrix-code">1 0 1 1 0<br>0 1 0 0 1<br>1 1 0 1 0</span>
                <b>{{ displayTime }}</b>
              </template>
              <b v-else>{{ displayTime }}</b>
            </div>
            <strong>{{ style.name }}</strong>
            <span v-if="store.state.style === style.id" class="choice-check">✓</span>
          </button>
        </section>
      </template>

      <template v-else>
        <header class="pixel-title">
          <span class="title-icon" aria-hidden="true">🔊</span>
          <h1><i>+</i> {{ t('sound.title') }} <i>+</i></h1>
          <button
            class="header-ble-control"
            :class="{ connected: store.ready.value, connecting: store.connecting.value, failed: store.state.connection === 'failed' }"
            :disabled="!canReconnect"
            @click="store.reconnect"
          ><i />{{ bleLabel }}</button>
        </header>

        <section class="sound-control-card volume-card">
          <label for="ambient-volume">🔊 <b>{{ t('sound.volume') }}</b></label>
          <input
            id="ambient-volume"
            type="range"
            min="0"
            max="100"
            :disabled="!store.ready.value"
            :value="store.state.volume"
            @input="store.setVolume(Number(($event.target as HTMLInputElement).value))"
          />
          <strong>{{ store.state.volume }}%</strong>
        </section>

        <section class="sound-control-card sleep-card">
          <h2>{{ t('sound.sleepTimer') }}</h2>
          <div class="sleep-options">
            <button
              v-for="value in ([0, 15, 30, 60] as const)"
              :key="value"
              :class="{ selected: store.state.soundSleepMinutes === value }"
              :disabled="!store.ready.value"
              @click="store.setSleepTimer(value)"
            >{{ sleepLabel(value) }}</button>
          </div>
          <p>{{ t('sound.sleepHint') }}</p>
        </section>

        <h2 class="section-title"><span>☆</span> {{ t('sound.clockEffects') }}</h2>
        <section class="sound-list">
          <button
            v-for="sound in CLOCK_SOUNDS"
            :key="sound.id"
            class="sound-row"
            :class="{ selected: store.state.soundId === sound.id }"
            :disabled="!store.ready.value"
            @click="store.selectSound(sound.id)"
          >
            <span class="sound-art">⏱️</span>
            <strong>{{ sound.name }}</strong>
            <span class="sound-check" :class="{ hidden: store.state.soundId !== sound.id }">✓</span>
          </button>
        </section>

        <h2 class="section-title"><span>☆</span> {{ t('sound.whiteNoise') }}</h2>
        <section class="sound-list">
          <button
            v-for="sound in NOISE_SOUNDS"
            :key="sound.id"
            class="sound-row"
            :class="{ selected: store.state.soundId === sound.id }"
            :disabled="!store.ready.value"
            @click="store.selectSound(sound.id)"
          >
            <span class="sound-art">{{ sound.id === 'rain' ? '🌧️' : '🔥' }}</span>
            <strong>{{ sound.name }}</strong>
            <span class="sound-check" :class="{ hidden: store.state.soundId !== sound.id }">✓</span>
          </button>
        </section>

        <h2 class="section-title custom-title"><span>☆</span> {{ t('sound.mySounds') }}</h2>
        <section v-if="store.state.customSounds.length" class="sound-list custom-sounds">
          <button
            v-for="sound in store.state.customSounds"
            :key="sound.id"
            class="sound-row"
            :class="{ selected: store.state.soundId === sound.id }"
            :disabled="!store.ready.value"
            @click="store.selectSound(sound.id)"
          >
            <span class="sound-art music-note">♪</span>
            <span class="custom-sound-copy"><strong>{{ sound.name }}</strong><small>{{ sound.url }}</small></span>
            <span class="edit-sound" role="button" :aria-label="t('sound.edit')" @click.stop="openEditSound(sound)">✎</span>
            <span class="sound-check" :class="{ hidden: store.state.soundId !== sound.id }">✓</span>
            <span class="remove-sound" role="button" :aria-label="t('sound.delete')" @click.stop="store.removeCustomSound(sound.id)">×</span>
          </button>
        </section>
        <button class="add-sound-button" :disabled="!store.ready.value" @click="openAddSound"><b>＋</b> {{ t('sound.add') }}</button>
      </template>

      <p v-if="store.statusText.value" :class="['ambient-message', { error: store.state.status === 'error' }]">
        {{ store.statusText.value }}
      </p>

      <button
        class="apply-pixelmug"
        :disabled="!store.ready.value || store.connecting.value || store.state.syncing"
        @click="store.applyToPixelMug"
      >
        <img :src="PIXELMUG_ICON" alt="" aria-hidden="true" />{{ store.ready.value ? store.primaryActionLabel.value : t('action.applyToPixelMug') }}
      </button>
    </section>

    <nav class="ambient-tabs" :aria-label="t('nav.pages')">
      <button :class="{ active: tab === 'clock' }" @click="tab = 'clock'"><span>◷</span>{{ t('clock.title') }}</button>
      <button :class="{ active: tab === 'sound' }" @click="tab = 'sound'"><span>♫</span>{{ t('sound.title') }}</button>
    </nav>

    <div v-if="sheet" class="sheet-backdrop" @click.self="sheet = null">
      <section class="bottom-sheet">
        <div class="sheet-handle" />
        <template v-if="sheet === 'timezone'">
          <div class="sheet-heading">
            <h3>{{ t('timezone.choose') }}</h3>
            <button @click="sheet = null">{{ t('action.done') }}</button>
          </div>
          <input v-model="zoneSearch" class="sheet-input" :placeholder="t('timezone.search')" />
          <div class="zone-list">
            <button v-for="zone in filteredZones" :key="zone.name" @click="chooseTimezone(zone.name)">
              <span><b>{{ zone.city }}</b><small>{{ zone.name }}</small></span>
              <i>{{ store.state.timezone === zone.name ? '✓' : '' }}</i>
            </button>
          </div>
        </template>
        <template v-else>
          <div class="sheet-heading">
            <h3>{{ editingSoundId ? t('sound.edit') : t('sound.add') }}</h3>
            <button @click="sheet = null">{{ t('action.cancel') }}</button>
          </div>
          <div class="add-sound-icon" aria-hidden="true">♪</div>
          <label class="field-label">{{ t('sound.name') }}<input v-model="soundName" class="sheet-input" maxlength="32" :placeholder="t('sound.namePlaceholder')" /></label>
          <label class="field-label">{{ t('sound.audioUrl') }}<input v-model="soundUrl" class="sheet-input" inputmode="url" placeholder="https://example.com/audio.ogg" /></label>
          <p v-if="formError" class="form-error">{{ formError }}</p>
          <button class="sheet-primary" @click="saveSound">{{ editingSoundId ? t('sound.save') : t('sound.add') }}</button>
        </template>
      </section>
    </div>
  </main>
</template>
