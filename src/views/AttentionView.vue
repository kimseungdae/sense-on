<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { useTracker } from '../composables/useTracker';
import { useAttention } from '../composables/useAttention';
import { useI18n } from '../composables/useI18n';
import type { TrackingResult, Point3D } from '../core/types';
import {
  TESSELATION, LEFT_EYE, RIGHT_EYE,
  LEFT_IRIS, RIGHT_IRIS, LIPS, FACE_OVAL,
} from '../core/face-connections';

const router = useRouter();
const { onResult, status, getVideoElement } = useTracker();
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
const { t, locale, toggleLocale } = useI18n();

const videoContainer = ref<HTMLDivElement>();
const canvas = ref<HTMLCanvasElement>();
let unsub: (() => void) | null = null;
let tickTimer: ReturnType<typeof setInterval> | null = null;
const elapsed = ref(0);

const stateLabel = computed(() => {
  const labels = {
    attentive: t.value.attentive,
    looking_away: t.value.lookingAway,
    drowsy: t.value.drowsy,
    absent: t.value.absent,
  };
  return labels[state.value];
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
  if (h > 0) return `${h}${t.value.hours}${m % 60}${t.value.minutes.trim()}`;
  if (m > 0) return `${m}${t.value.minutes}${s % 60}${t.value.seconds}`;
  return `${s}${t.value.seconds}`;
}

// --- Wireframe rendering ---
function drawWireframe(ctx: CanvasRenderingContext2D, landmarks: Point3D[], w: number, h: number) {
  ctx.clearRect(0, 0, w, h);

  const lx = (p: Point3D) => (1 - p.x) * w;
  const ly = (p: Point3D) => p.y * h;

  const zValues = landmarks.map(p => p.z);
  const zMin = Math.min(...zValues);
  const zMax = Math.max(...zValues);
  const zRange = zMax - zMin || 1;
  const depthAlpha = (p: Point3D) => {
    const t = 1 - (p.z - zMin) / zRange;
    return 0.15 + t * 0.45;
  };

  function drawConnections(
    conns: [number, number][],
    color: string,
    lineWidth: number,
    baseAlpha: number,
  ) {
    ctx.lineWidth = lineWidth;
    for (const [i, j] of conns) {
      const a = landmarks[i], b = landmarks[j];
      if (!a || !b) continue;
      const alpha = baseAlpha * (depthAlpha(a) + depthAlpha(b)) / 2;
      ctx.strokeStyle = color.replace('A', String(alpha));
      ctx.beginPath();
      ctx.moveTo(lx(a), ly(a));
      ctx.lineTo(lx(b), ly(b));
      ctx.stroke();
    }
  }

  drawConnections(TESSELATION, 'rgba(0,220,255,A)', 0.5, 0.6);
  drawConnections(FACE_OVAL, 'rgba(100,255,200,A)', 1.2, 1.0);
  drawConnections(LEFT_EYE, 'rgba(0,255,150,A)', 1.5, 1.0);
  drawConnections(RIGHT_EYE, 'rgba(0,255,150,A)', 1.5, 1.0);
  drawConnections(LEFT_IRIS, 'rgba(255,100,100,A)', 2, 1.0);
  drawConnections(RIGHT_IRIS, 'rgba(255,100,100,A)', 2, 1.0);

  for (const idx of [468, 473]) {
    const p = landmarks[idx];
    if (!p) continue;
    ctx.fillStyle = `rgba(255,80,80,${depthAlpha(p)})`;
    ctx.beginPath();
    ctx.arc(lx(p), ly(p), 3, 0, Math.PI * 2);
    ctx.fill();
  }

  drawConnections(LIPS, 'rgba(255,150,200,A)', 1.2, 0.9);
}

function handleResult(data: TrackingResult) {
  processResult(data);

  if (data.landmarks && canvas.value) {
    const ctx = canvas.value.getContext('2d');
    if (ctx) {
      drawWireframe(ctx, data.landmarks, canvas.value.width, canvas.value.height);
    }
  }
}

function finish() {
  router.push('/');
}

onMounted(async () => {
  if (status.value !== 'running') {
    router.push('/');
    return;
  }

  reset();

  await nextTick();
  const video = getVideoElement();
  if (video && videoContainer.value) {
    video.style.width = '100%';
    video.style.height = '100%';
    video.style.objectFit = 'cover';
    video.style.transform = 'scaleX(-1)';
    videoContainer.value.prepend(video);
  }

  if (canvas.value) {
    canvas.value.width = 640;
    canvas.value.height = 480;
  }

  unsub = onResult(handleResult);
  tickTimer = setInterval(() => {
    elapsed.value = performance.now();
  }, 200);
});

onUnmounted(() => {
  unsub?.();
  if (tickTimer) clearInterval(tickTimer);

  if (videoContainer.value) {
    const video = videoContainer.value.querySelector('video');
    if (video) video.remove();
  }
});
</script>

<template>
  <div class="attention" :style="{ '--state-color': stateColor }">
    <div class="header">
      <h1>sense-on</h1>
      <button class="lang-toggle" @click="toggleLocale">
        {{ locale === 'en' ? '한국어' : 'EN' }}
      </button>
    </div>

    <div class="main-area">
      <div ref="videoContainer" class="video-container">
        <canvas ref="canvas" class="wireframe-canvas" />
        <div class="state-badge">
          <div class="state-dot" />
          <span>{{ stateLabel }}</span>
          <span class="streak" v-if="state === 'attentive' && currentStreakMs > 1000">
            {{ formatTime(currentStreakMs) }}
          </span>
        </div>
      </div>

      <div class="metrics">
        <div class="metric-card">
          <div class="metric-label">{{ t.attentionRate }}</div>
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
            <div class="metric-label">{{ t.distractionCount }}</div>
            <div class="metric-value">{{ distractionCount }}{{ t.times }}</div>
          </div>
          <div class="metric-card small">
            <div class="metric-label">{{ t.attentiveTime }}</div>
            <div class="metric-value">{{ formatTime(attentiveMs) }}</div>
          </div>
          <div class="metric-card small">
            <div class="metric-label">{{ t.totalTime }}</div>
            <div class="metric-value">{{ formatTime(totalMs) }}</div>
          </div>
        </div>
      </div>
    </div>

    <div class="debug">
      <span>yaw: {{ raw.headYaw.toFixed(1) }}°</span>
      <span>pitch: {{ raw.headPitch.toFixed(1) }}°</span>
      <span>EAR: {{ raw.eyeOpenness.toFixed(2) }}</span>
    </div>

    <button class="btn" @click="finish">{{ t.finish }}</button>
  </div>
</template>

<style scoped>
.attention {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-height: 100vh;
  background: #0d1117;
  color: #e6edf3;
  padding: 20px;
  gap: 20px;
}

.header {
  text-align: center;
  position: relative;
  width: 100%;
  max-width: 480px;
}

.header h1 {
  font-size: 24px;
  font-weight: 700;
  margin: 0;
  background: linear-gradient(135deg, #4fc3f7, #66bb6a);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.lang-toggle {
  position: absolute;
  top: 0;
  right: 0;
  padding: 4px 12px;
  background: transparent;
  color: #888;
  border: 1px solid #30363d;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
}

.lang-toggle:hover { color: #e6edf3; border-color: #4a90d9; }

.main-area {
  width: 100%;
  max-width: 480px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.video-container {
  position: relative;
  width: 100%;
  aspect-ratio: 4 / 3;
  background: #111;
  border-radius: 10px;
  overflow: hidden;
}

.wireframe-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 5;
}

.state-badge {
  position: absolute;
  top: 12px;
  left: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(8px);
  padding: 6px 14px;
  border-radius: 20px;
  z-index: 10;
  font-size: 14px;
  font-weight: 600;
  color: var(--state-color);
}

.state-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--state-color);
  box-shadow: 0 0 10px var(--state-color);
  transition: background 0.3s, box-shadow 0.3s;
}

.streak {
  font-size: 12px;
  color: #888;
  font-weight: 400;
}

.metrics {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.metric-card {
  background: #161b22;
  border: 1px solid #21262d;
  border-radius: 10px;
  padding: 14px;
}

.metric-card.small { padding: 10px; }

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
