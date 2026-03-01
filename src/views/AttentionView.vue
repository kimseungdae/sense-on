<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useTracker } from '../composables/useTracker';
import { useAttention } from '../composables/useAttention';

const router = useRouter();
const { onResult, status } = useTracker();
const {
  state,
  raw,
  attentiveMs,
  totalMs,
  distractionCount,
  currentStreakMs,
  attentionRate,
  processResult,
  reset,
} = useAttention();

let unsub: (() => void) | null = null;
let tickTimer: ReturnType<typeof setInterval> | null = null;
const elapsed = ref(0);

const stateLabel = computed(() => {
  switch (state.value) {
    case 'attentive': return '집중 중';
    case 'looking_away': return '시선 이탈';
    case 'drowsy': return '졸림';
    case 'absent': return '자리 비움';
  }
});

const stateColor = computed(() => {
  switch (state.value) {
    case 'attentive': return '#66bb6a';
    case 'looking_away': return '#ffa726';
    case 'drowsy': return '#ff7043';
    case 'absent': return '#ef5350';
  }
});

function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}시간 ${m % 60}분`;
  if (m > 0) return `${m}분 ${s % 60}초`;
  return `${s}초`;
}

function finish() {
  router.push('/');
}

onMounted(() => {
  if (status.value !== 'running') {
    router.push('/');
    return;
  }
  reset();
  unsub = onResult(processResult);
  tickTimer = setInterval(() => {
    elapsed.value = performance.now();
  }, 200);
});

onUnmounted(() => {
  unsub?.();
  if (tickTimer) clearInterval(tickTimer);
});
</script>

<template>
  <div class="attention" :style="{ '--state-color': stateColor }">
    <div class="header">
      <h1>sense-on</h1>
      <p class="subtitle">Attention Monitor</p>
    </div>

    <div class="state-indicator">
      <div class="state-dot" />
      <span class="state-label">{{ stateLabel }}</span>
      <span class="streak" v-if="state === 'attentive'">
        {{ formatTime(currentStreakMs) }}
      </span>
    </div>

    <div class="metrics">
      <div class="metric-card">
        <div class="metric-label">집중률</div>
        <div class="metric-value">{{ Math.round(attentionRate * 100) }}%</div>
        <div class="bar-track">
          <div
            class="bar-fill"
            :style="{ width: attentionRate * 100 + '%', background: attentionRate >= 0.7 ? '#66bb6a' : '#ef5350' }"
          />
        </div>
      </div>

      <div class="metric-row">
        <div class="metric-card small">
          <div class="metric-label">이탈 횟수</div>
          <div class="metric-value">{{ distractionCount }}회</div>
        </div>
        <div class="metric-card small">
          <div class="metric-label">집중 시간</div>
          <div class="metric-value">{{ formatTime(attentiveMs) }}</div>
        </div>
        <div class="metric-card small">
          <div class="metric-label">전체 시간</div>
          <div class="metric-value">{{ formatTime(totalMs) }}</div>
        </div>
      </div>
    </div>

    <div class="debug">
      <span>yaw: {{ raw.headYaw.toFixed(1) }}°</span>
      <span>pitch: {{ raw.headPitch.toFixed(1) }}°</span>
      <span>EAR: {{ raw.eyeOpenness.toFixed(2) }}</span>
    </div>

    <button class="btn" @click="finish">종료</button>
  </div>
</template>

<style scoped>
.attention {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background: #0d1117;
  color: #e6edf3;
  padding: 20px;
  gap: 32px;
}

.header { text-align: center; }

.header h1 {
  font-size: 28px;
  font-weight: 700;
  margin: 0;
  background: linear-gradient(135deg, #4fc3f7, #66bb6a);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.subtitle { color: #888; margin: 4px 0 0; font-size: 14px; }

.state-indicator {
  display: flex;
  align-items: center;
  gap: 16px;
}

.state-dot {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--state-color);
  box-shadow: 0 0 20px var(--state-color);
  transition: background 0.3s, box-shadow 0.3s;
}

.state-label {
  font-size: 32px;
  font-weight: 700;
  color: var(--state-color);
  transition: color 0.3s;
}

.streak {
  font-size: 18px;
  color: #888;
}

.metrics {
  width: 320px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.metric-card {
  background: #161b22;
  border: 1px solid #21262d;
  border-radius: 10px;
  padding: 16px;
}

.metric-card.small { padding: 12px; }

.metric-row {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 8px;
}

.metric-label { font-size: 12px; color: #888; margin-bottom: 4px; }
.metric-value { font-size: 20px; font-weight: 600; }
.metric-card.small .metric-value { font-size: 16px; }

.bar-track {
  height: 6px;
  background: #21262d;
  border-radius: 3px;
  margin-top: 8px;
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.3s;
}

.debug {
  display: flex;
  gap: 16px;
  font-size: 12px;
  color: #555;
  font-family: monospace;
}

.btn {
  padding: 10px 32px;
  background: #21262d;
  color: #8ba4c0;
  border: 1px solid #30363d;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
}

.btn:hover { border-color: #4a90d9; color: #e6edf3; }
</style>
