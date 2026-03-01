<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useTracker } from '../composables/useTracker';

const router = useRouter();
const { start, status } = useTracker();
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
    <div class="hero">
      <h1>sense-on</h1>
      <p class="subtitle">Attention monitoring for kids</p>
    </div>

    <div class="actions">
      <button
        class="btn primary"
        :disabled="loading"
        @click="startAttention"
      >
        {{ loading ? '카메라 로딩...' : '시작' }}
      </button>

      <router-link to="/demo" class="btn secondary">
        Demo Mode
      </router-link>
    </div>

    <p class="note">
      화면을 보고 있는지 실시간으로 감지합니다.<br>
      카메라 권한이 필요합니다.
    </p>
  </div>
</template>

<style scoped>
.home {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background: #0d1117;
  color: #e6edf3;
  padding: 20px;
}

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

.btn.secondary {
  background: #1e2a3a;
  color: #8ba4c0;
  border: 1px solid #2d3f54;
}

.note {
  margin-top: 32px;
  font-size: 13px;
  color: #555;
  text-align: center;
  line-height: 1.5;
}
</style>
