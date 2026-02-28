<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useTracker } from '../composables/useTracker';
import { useCalibration } from '../composables/useCalibration';
import {
  computeAffineTransform,
  type CalibrationSample,
} from '../core/calibration';
import type { Point2D } from '../core/types';

const router = useRouter();
const { onResult, status } = useTracker();
const { setTransform } = useCalibration();

// 9-point grid (3x3) with 10% padding
const PADDING = 0.1;
const GRID: Point2D[] = [];
for (const row of [0, 0.5, 1]) {
  for (const col of [0, 0.5, 1]) {
    GRID.push({
      x: PADDING + col * (1 - 2 * PADDING),
      y: PADDING + row * (1 - 2 * PADDING),
    });
  }
}

const currentIndex = ref(-1); // -1 = intro
const progress = ref(0); // 0..1 ring progress
const samples = ref<CalibrationSample[]>([]);
const collecting = ref(false);

// Gaze collection state
const STABILIZE_MS = 500;
const COLLECT_MS = 2000;
let gazeBuffer: Point2D[] = [];
let resultUnsub: (() => void) | null = null;

function currentScreenPos(): Point2D {
  const pt = GRID[currentIndex.value]!;
  return {
    x: pt.x * window.innerWidth,
    y: pt.y * window.innerHeight,
  };
}

function collectGaze() {
  gazeBuffer = [];
  collecting.value = true;
  progress.value = 0;

  resultUnsub = onResult((data) => {
    gazeBuffer.push(data.gazeRatio);
  });

  // Stabilize phase
  setTimeout(() => {
    gazeBuffer = []; // discard stabilize frames
    const startTime = performance.now();

    // Collection phase with progress animation
    const progressInterval = setInterval(() => {
      const elapsed = performance.now() - startTime;
      progress.value = Math.min(elapsed / COLLECT_MS, 1);
      if (progress.value >= 1) {
        clearInterval(progressInterval);
      }
    }, 16);

    setTimeout(() => {
      clearInterval(progressInterval);
      resultUnsub?.();
      resultUnsub = null;
      collecting.value = false;
      progress.value = 1;

      // Average collected gaze samples
      if (gazeBuffer.length > 0) {
        const avg: Point2D = { x: 0, y: 0 };
        for (const g of gazeBuffer) {
          avg.x += g.x;
          avg.y += g.y;
        }
        avg.x /= gazeBuffer.length;
        avg.y /= gazeBuffer.length;

        samples.value.push({
          gaze: avg,
          screen: currentScreenPos(),
        });
      }

      nextPoint();
    }, COLLECT_MS);
  }, STABILIZE_MS);
}

function nextPoint() {
  currentIndex.value++;
  if (currentIndex.value >= GRID.length) {
    finishCalibration();
    return;
  }
  // Auto-start collection after brief delay
  setTimeout(() => collectGaze(), 300);
}

function finishCalibration() {
  const transform = computeAffineTransform(samples.value);
  if (transform) {
    setTransform(transform);
    router.push('/reader');
  } else {
    // Fallback: retry
    samples.value = [];
    currentIndex.value = -1;
  }
}

function startCalibration() {
  // Request fullscreen
  document.documentElement.requestFullscreen?.().catch(() => {});
  samples.value = [];
  currentIndex.value = 0;
  setTimeout(() => collectGaze(), 500);
}

onMounted(() => {
  if (status.value !== 'running') {
    router.push('/');
  }
});

onUnmounted(() => {
  resultUnsub?.();
});
</script>

<template>
  <div class="calibration">
    <!-- Intro screen -->
    <div v-if="currentIndex === -1" class="intro">
      <h2>Gaze Calibration</h2>
      <p>화면에 나타나는 점을 응시하세요.<br>총 9개 점을 순차적으로 측정합니다.</p>
      <button class="btn" @click="startCalibration">시작</button>
    </div>

    <!-- Calibration points -->
    <template v-else-if="currentIndex < GRID.length">
      <div class="status-bar">
        <span>{{ currentIndex + 1 }} / {{ GRID.length }}</span>
        <span v-if="collecting" class="collecting-text">응시하세요...</span>
      </div>

      <div
        v-for="(pt, i) in GRID"
        :key="i"
        class="point-wrapper"
        :style="{
          left: pt.x * 100 + '%',
          top: pt.y * 100 + '%',
        }"
      >
        <!-- Progress ring -->
        <svg
          v-if="i === currentIndex"
          class="ring"
          viewBox="0 0 44 44"
        >
          <circle
            cx="22" cy="22" r="18"
            fill="none"
            stroke="#333"
            stroke-width="3"
          />
          <circle
            cx="22" cy="22" r="18"
            fill="none"
            stroke="#4fc3f7"
            stroke-width="3"
            stroke-linecap="round"
            :stroke-dasharray="113.1"
            :stroke-dashoffset="113.1 * (1 - progress)"
            transform="rotate(-90 22 22)"
          />
        </svg>

        <!-- Dot -->
        <div
          class="dot"
          :class="{
            active: i === currentIndex,
            done: i < currentIndex,
            pending: i > currentIndex,
          }"
        />
      </div>
    </template>

    <!-- Completing -->
    <div v-else class="intro">
      <p>캘리브레이션 완료! 잠시만...</p>
    </div>
  </div>
</template>

<style scoped>
.calibration {
  position: fixed;
  inset: 0;
  background: #0a0e14;
  overflow: hidden;
}

.intro {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #e6edf3;
}

.intro h2 {
  font-size: 28px;
  margin: 0 0 12px;
}

.intro p {
  color: #888;
  text-align: center;
  line-height: 1.6;
  margin: 0 0 24px;
}

.btn {
  padding: 12px 32px;
  background: #4a90d9;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  cursor: pointer;
}

.btn:hover { opacity: 0.85; }

.status-bar {
  position: fixed;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 12px;
  color: #888;
  font-size: 14px;
  z-index: 10;
}

.collecting-text {
  color: #4fc3f7;
}

.point-wrapper {
  position: fixed;
  transform: translate(-50%, -50%);
}

.ring {
  position: absolute;
  width: 44px;
  height: 44px;
  top: -22px;
  left: -22px;
}

.dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  position: absolute;
  top: -7px;
  left: -7px;
  transition: all 0.3s;
}

.dot.active {
  background: #4fc3f7;
  box-shadow: 0 0 12px #4fc3f7aa;
}

.dot.done {
  background: #66bb6a;
  width: 10px;
  height: 10px;
  top: -5px;
  left: -5px;
}

.dot.pending {
  background: #333;
  width: 8px;
  height: 8px;
  top: -4px;
  left: -4px;
}
</style>
