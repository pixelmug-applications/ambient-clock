<script setup lang="ts">
import { onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { LOADING_IMAGE } from '../assets';
import { t } from '../i18n';
import { useAmbientClock } from '../state/ambientClock';

const router = useRouter();
const store = useAmbientClock();
let opening = false;

async function handleOpen() {
  if (opening) return;
  opening = true;
  try {
    const opened = await store.openOnDevice();
    if (!opened) return;
    await router.push('/home');
    await store.connectDevice();
  } finally {
    opening = false;
  }
}

onMounted(() => {
  void handleOpen();
});
</script>

<template>
  <main class="landing clock-landing">
    <div class="world-map" aria-hidden="true">
      <span class="route r1" />
      <span class="route r2" />
      <span class="pin p1" />
      <span class="pin p2" />
      <span class="pin p3" />
    </div>

    <div class="landing-visual" aria-hidden="true">
      <div class="loading-device clock-device">
        <img :src="LOADING_IMAGE" alt="" />
      </div>
    </div>

    <div class="landing-copy">
      <h1>{{ t('app.title') }}</h1>
      <p>{{ t('landing.subtitle') }}</p>
    </div>

    <div class="landing-actions">
      <button class="landing-primary" :disabled="store.busy.value" @click="handleOpen">
        {{ store.openButtonLabel.value }}
      </button>
      <p
        v-if="store.statusText.value"
        :class="store.state.status === 'error' ? 'landing-error' : 'landing-status'"
      >
        {{ store.statusText.value }}
      </p>
    </div>
  </main>
</template>
