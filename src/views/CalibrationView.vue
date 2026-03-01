<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useTracker } from '../composables/useTracker';
import { useCalibration } from '../composables/useCalibration';
import {
  computeGazeTransform,
  applyGazeTransform,
  buildFeatureVector,
  type CalibrationSample,
  type GazeTransform,
} from '../core/calibration';
import type { Point2D } from '../core/types';

const router = useRouter();
const { onResult, status } = useTracker();
const { setTransform } = useCalibration();

// --- Phase state ---
type Phase = 'intro' | 'phase1' | 'phase2' | 'done';
const phase = ref<Phase>('intro');

// --- Phase 1: 9-point grid ---
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

const currentIndex = ref(0);
const progress = ref(0);
const samples = ref<CalibrationSample[]>([]);
const collecting = ref(false);

// --- Phase 2: validation/refinement ---
const WINDOW_SIZE = 10;
const TARGET_RATE = 0.8;
let currentTransform: GazeTransform | null = null;
const validationPoint = ref<Point2D>({ x: 0.5, y: 0.5 });
const hitHistory = ref<boolean[]>([]);
const lastResult = ref<'hit' | 'miss' | null>(null);

const hitRate = computed(() => {
  if (hitHistory.value.length === 0) return 0;
  const recent = hitHistory.value.slice(-WINDOW_SIZE);
  return recent.filter(Boolean).length / recent.length;
});

const hitCount = computed(() => {
  const recent = hitHistory.value.slice(-WINDOW_SIZE);
  return recent.filter(Boolean).length;
});

const totalCount = computed(() => {
  return Math.min(hitHistory.value.length, WINDOW_SIZE);
});

// --- Shared gaze collection ---
const STABILIZE_MS = 500;
const COLLECT_MS_P1 = 3000;
const COLLECT_MS_P2 = 1500;
const SUBSAMPLE_RATE = 3;
let frameBuffer: number[][] = [];
let frameCounter = 0;
let resultUnsub: (() => void) | null = null;

function collectAndCallback(collectMs: number, cb: () => void) {
  frameBuffer = [];
  frameCounter = 0;
  collecting.value = true;
  progress.value = 0;

  resultUnsub = onResult((data) => {
    frameCounter++;
    if (frameCounter % SUBSAMPLE_RATE !== 0) return;
    if (!data.faceCenter) return;

    const features = buildFeatureVector(
      data.eyePatches,
      data.gazeFeatures.headYaw,
      data.gazeFeatures.headPitch,
      data.faceCenter,
    );
    frameBuffer.push(features);
  });

  setTimeout(() => {
    frameBuffer = [];
    frameCounter = 0;
    const startTime = performance.now();

    const progressInterval = setInterval(() => {
      const elapsed = performance.now() - startTime;
      progress.value = Math.min(elapsed / collectMs, 1);
      if (progress.value >= 1) clearInterval(progressInterval);
    }, 16);

    setTimeout(() => {
      clearInterval(progressInterval);
      resultUnsub?.();
      resultUnsub = null;
      collecting.value = false;
      progress.value = 1;
      cb();
    }, collectMs);
  }, STABILIZE_MS);
}

// --- Phase 1 logic ---
function phase1ScreenPos(): Point2D {
  const pt = GRID[currentIndex.value]!;
  return {
    x: pt.x * window.innerWidth,
    y: pt.y * window.innerHeight,
  };
}

function startPhase1Point() {
  collectAndCallback(COLLECT_MS_P1, () => {
    const screenPos = phase1ScreenPos();
    for (const features of frameBuffer) {
      samples.value.push({ features, screen: screenPos });
    }
    currentIndex.value++;
    if (currentIndex.value >= GRID.length) {
      enterPhase2();
    } else {
      setTimeout(() => startPhase1Point(), 300);
    }
  });
}

function enterPhase2() {
  console.log(`[calibration] samples: ${samples.value.length}, features: ${samples.value[0]?.features.length}`);
  currentTransform = computeGazeTransform(samples.value);
  if (!currentTransform) {
    console.warn(`[calibration] transform failed: ${samples.value.length} samples`);
    phase.value = 'intro';
    samples.value = [];
    return;
  }
  phase.value = 'phase2';
  hitHistory.value = [];
  generateRandomPoint();
  setTimeout(() => startPhase2Round(), 500);
}

// --- Phase 2 logic ---
function hitThreshold(): number {
  const diag = Math.sqrt(
    window.innerWidth ** 2 + window.innerHeight ** 2,
  );
  return diag * 0.08;
}

let lastPoint: Point2D = { x: 0.5, y: 0.5 };

function generateRandomPoint() {
  const PAD = 0.15;
  const minDist = 0.2;
  let pt: Point2D;
  let attempts = 0;
  do {
    pt = {
      x: PAD + Math.random() * (1 - 2 * PAD),
      y: PAD + Math.random() * (1 - 2 * PAD),
    };
    attempts++;
  } while (
    attempts < 20 &&
    Math.hypot(pt.x - lastPoint.x, pt.y - lastPoint.y) < minDist
  );
  lastPoint = pt;
  validationPoint.value = pt;
}

function startPhase2Round() {
  lastResult.value = null;
  collectAndCallback(COLLECT_MS_P2, () => {
    if (frameBuffer.length === 0 || !currentTransform) {
      generateRandomPoint();
      setTimeout(() => startPhase2Round(), 300);
      return;
    }

    const actual: Point2D = {
      x: validationPoint.value.x * window.innerWidth,
      y: validationPoint.value.y * window.innerHeight,
    };

    let sumX = 0, sumY = 0;
    for (const features of frameBuffer) {
      const pred = applyGazeTransform(currentTransform!, features);
      sumX += pred.x;
      sumY += pred.y;
    }
    const predicted = { x: sumX / frameBuffer.length, y: sumY / frameBuffer.length };

    const dist = Math.hypot(predicted.x - actual.x, predicted.y - actual.y);
    const isHit = dist < hitThreshold();

    hitHistory.value.push(isHit);
    lastResult.value = isHit ? 'hit' : 'miss';

    if (!isHit) {
      for (const features of frameBuffer) {
        samples.value.push({ features, screen: actual });
      }
      currentTransform = computeGazeTransform(samples.value) ?? currentTransform;
    }

    // Check if we've reached target accuracy
    const recent = hitHistory.value.slice(-WINDOW_SIZE);
    if (
      recent.length >= WINDOW_SIZE &&
      recent.filter(Boolean).length / recent.length >= TARGET_RATE
    ) {
      finishCalibration();
      return;
    }

    // Next round
    setTimeout(() => {
      generateRandomPoint();
      setTimeout(() => startPhase2Round(), 300);
    }, 400);
  });
}

function finishCalibration() {
  if (currentTransform) {
    phase.value = 'done';
    setTransform(currentTransform);
    setTimeout(() => router.push('/reader'), 500);
  }
}

// --- Start ---
function startCalibration() {
  document.documentElement.requestFullscreen?.().catch(() => {});
  samples.value = [];
  currentIndex.value = 0;
  phase.value = 'phase1';
  setTimeout(() => startPhase1Point(), 500);
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
    <!-- Intro -->
    <div v-if="phase === 'intro'" class="intro">
      <h2>Gaze Calibration</h2>
      <p>
        화면에 나타나는 점을 응시하세요.<br>
        <strong>머리를 살짝 움직이면서</strong> 점을 계속 바라보세요.<br>
        9개 기본점 측정 후, 정확도 80%까지 자동 보정합니다.
      </p>
      <button class="btn" @click="startCalibration">시작</button>
    </div>

    <!-- Phase 1: 9-point grid -->
    <template v-else-if="phase === 'phase1'">
      <div class="status-bar">
        <span>기본 측정 {{ currentIndex + 1 }} / {{ GRID.length }}</span>
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
        <svg v-if="i === currentIndex" class="ring" viewBox="0 0 44 44">
          <circle cx="22" cy="22" r="18" fill="none" stroke="#333" stroke-width="3" />
          <circle
            cx="22" cy="22" r="18" fill="none" stroke="#4fc3f7" stroke-width="3"
            stroke-linecap="round"
            :stroke-dasharray="113.1"
            :stroke-dashoffset="113.1 * (1 - progress)"
            transform="rotate(-90 22 22)"
          />
        </svg>
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

    <!-- Phase 2: validation/refinement -->
    <template v-else-if="phase === 'phase2'">
      <div class="status-bar phase2-bar">
        <div class="accuracy-info">
          <span>정확도</span>
          <span class="accuracy-value" :class="{ good: hitRate >= TARGET_RATE }">
            {{ Math.round(hitRate * 100) }}%
          </span>
          <span class="accuracy-detail">({{ hitCount }}/{{ totalCount }})</span>
          <span class="accuracy-target">목표 80%</span>
        </div>
        <div class="accuracy-bar">
          <div
            class="accuracy-fill"
            :class="{ good: hitRate >= TARGET_RATE }"
            :style="{ width: hitRate * 100 + '%' }"
          />
          <div class="accuracy-threshold" />
        </div>
      </div>

      <!-- Validation point -->
      <div
        class="point-wrapper"
        :style="{
          left: validationPoint.x * 100 + '%',
          top: validationPoint.y * 100 + '%',
        }"
      >
        <svg class="ring" viewBox="0 0 44 44">
          <circle cx="22" cy="22" r="18" fill="none" stroke="#333" stroke-width="3" />
          <circle
            cx="22" cy="22" r="18" fill="none"
            :stroke="lastResult === 'hit' ? '#66bb6a' : lastResult === 'miss' ? '#ef5350' : '#4fc3f7'"
            stroke-width="3" stroke-linecap="round"
            :stroke-dasharray="113.1"
            :stroke-dashoffset="113.1 * (1 - progress)"
            transform="rotate(-90 22 22)"
          />
        </svg>
        <div class="dot active" />
      </div>

      <div class="phase2-hint">
        <span v-if="collecting">점을 응시하세요...</span>
        <span v-else-if="lastResult === 'hit'" class="result-hit">정확!</span>
        <span v-else-if="lastResult === 'miss'" class="result-miss">보정 중...</span>
      </div>
    </template>

    <!-- Done -->
    <div v-else-if="phase === 'done'" class="intro">
      <h2 class="done-title">캘리브레이션 완료!</h2>
      <p>정확도 {{ Math.round(hitRate * 100) }}% 달성</p>
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

.intro h2 { font-size: 28px; margin: 0 0 12px; }
.intro p { color: #888; text-align: center; line-height: 1.6; margin: 0 0 24px; }

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

.collecting-text { color: #4fc3f7; }

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

/* Phase 2 styles */
.phase2-bar {
  flex-direction: column;
  align-items: center;
  gap: 8px;
  width: 280px;
}

.accuracy-info {
  display: flex;
  align-items: baseline;
  gap: 6px;
  font-size: 14px;
}

.accuracy-value {
  font-size: 20px;
  font-weight: 700;
  color: #ef5350;
  transition: color 0.3s;
}
.accuracy-value.good { color: #66bb6a; }

.accuracy-detail { color: #555; font-size: 12px; }
.accuracy-target { color: #555; font-size: 12px; margin-left: 4px; }

.accuracy-bar {
  width: 100%;
  height: 6px;
  background: #1e2a3a;
  border-radius: 3px;
  position: relative;
  overflow: visible;
}

.accuracy-fill {
  height: 100%;
  background: #ef5350;
  border-radius: 3px;
  transition: width 0.3s, background 0.3s;
}
.accuracy-fill.good { background: #66bb6a; }

.accuracy-threshold {
  position: absolute;
  left: 80%;
  top: -3px;
  width: 2px;
  height: 12px;
  background: #888;
  border-radius: 1px;
}

.phase2-hint {
  position: fixed;
  bottom: 40px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 16px;
  color: #888;
}

.result-hit { color: #66bb6a; font-weight: 600; }
.result-miss { color: #ef5350; }

.done-title {
  background: linear-gradient(135deg, #4fc3f7, #66bb6a);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}
</style>
