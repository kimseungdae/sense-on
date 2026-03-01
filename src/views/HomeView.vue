<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useTracker } from '../composables/useTracker';
import { useI18n } from '../composables/useI18n';

const router = useRouter();
const { start, status } = useTracker();
const { t, locale, toggleLocale } = useI18n();
const loading = ref(false);

async function startAttention() {
  loading.value = true;
  await start();
  loading.value = false;
  if (status.value === 'running') {
    router.push('/attention');
  }
}
</script>

<template>
  <div class="home">
    <button class="lang-toggle" @click="toggleLocale">
      {{ locale === 'en' ? '한국어' : 'EN' }}
    </button>

    <div class="hero">
      <h1>sense-on</h1>
      <p class="subtitle">{{ t.subtitle }}</p>
    </div>

    <div class="actions">
      <button
        class="btn primary"
        :disabled="loading"
        @click="startAttention"
      >
        {{ loading ? t.cameraLoading : t.start }}
      </button>
    </div>

    <p class="note">
      {{ t.description }}<br>
      {{ t.cameraPermission }}
    </p>
  </div>
</template>

<style scoped>
.home {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background: #0d1117;
  color: #e6edf3;
  padding: 20px;
}

.lang-toggle {
  position: absolute;
  top: 16px;
  right: 16px;
  padding: 4px 12px;
  background: transparent;
  color: #888;
  border: 1px solid #30363d;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
}

.lang-toggle:hover { color: #e6edf3; border-color: #4a90d9; }

.hero {
  text-align: center;
  margin-bottom: 48px;
}

h1 {
  font-size: 48px;
  font-weight: 700;
  margin: 0;
  background: linear-gradient(135deg, #4fc3f7, #66bb6a);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.subtitle {
  font-size: 16px;
  color: #888;
  margin: 8px 0 0;
}

.actions {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 260px;
}

.btn {
  display: block;
  padding: 14px 24px;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 500;
  cursor: pointer;
  text-align: center;
  text-decoration: none;
  transition: opacity 0.15s;
}

.btn:hover { opacity: 0.85; }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }

.btn.primary {
  background: #4a90d9;
  color: white;
}

.note {
  margin-top: 32px;
  font-size: 13px;
  color: #555;
  text-align: center;
  line-height: 1.5;
}
</style>
