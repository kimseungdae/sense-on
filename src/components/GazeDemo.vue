<script setup lang="ts">
import { ref, shallowRef, onMounted, onUnmounted } from 'vue';
import { createCameraStream, createTrackerClient, createPointFilter } from '../core';
import type { TrackingResult } from '../core';

const videoContainer = ref<HTMLDivElement>();
const status = shallowRef<'idle' | 'loading' | 'running' | 'error'>('idle');
const errorMsg = ref('');
const fps = ref(0);
const inferenceMs = ref(0);
const gazeX = ref(0);
const gazeY = ref(0);
const headYaw = ref(0);
const headPitch = ref(0);
const headRoll = ref(0);

let camera: ReturnType<typeof createCameraStream> | null = null;
let tracker: ReturnType<typeof createTrackerClient> | null = null;
let unsubFrame: (() => void) | null = null;
let unsubResult: (() => void) | null = null;
let unsubError: (() => void) | null = null;

const gazeFilter = createPointFilter({ minCutoff: 1.5, beta: 0.5 });
const GAZE_GAIN = 2.5; // amplify - iris movement range is very small

// FPS counter
let frameCount = 0;
let lastFpsTime = 0;
let fpsInterval: number | null = null;

function updateFps() {
  const now = performance.now();
  if (lastFpsTime > 0) {
    fps.value = Math.round(frameCount / ((now - lastFpsTime) / 1000));
  }
  frameCount = 0;
  lastFpsTime = now;
}

function handleResult(data: TrackingResult) {
  frameCount++;
  inferenceMs.value = Math.round(data.inferenceMs);

  const filtered = gazeFilter.filter(data.gazeRatio, data.timestamp);
  const clamp = (v: number) => Math.max(-1, Math.min(1, v));
  gazeX.value = clamp(filtered.x * GAZE_GAIN);
  gazeY.value = clamp(filtered.y * GAZE_GAIN);

  headYaw.value = Math.round(data.headPose.yaw);
  headPitch.value = Math.round(data.headPose.pitch);
  headRoll.value = Math.round(data.headPose.roll);
}

async function start() {
  status.value = 'loading';
  errorMsg.value = '';

  try {
    camera = createCameraStream();
    tracker = createTrackerClient();

    await camera.start();

    if (videoContainer.value) {
      const video = camera.getVideoElement();
      video.style.width = '100%';
      video.style.height = '100%';
      video.style.objectFit = 'cover';
      video.style.transform = 'scaleX(-1)';
      videoContainer.value.prepend(video);
    }

    await tracker.init();

    unsubResult = tracker.onResult(handleResult);
    unsubError = tracker.onError((msg) => {
      console.error('[sense-on]', msg);
    });

    unsubFrame = camera.onFrame((frame) => {
      tracker!.detect(frame, performance.now());
    });

    fpsInterval = window.setInterval(updateFps, 1000);
    status.value = 'running';
  } catch (err) {
    status.value = 'error';
    errorMsg.value = err instanceof Error ? err.message : String(err);
  }
}

function stop() {
  if (fpsInterval) {
    clearInterval(fpsInterval);
    fpsInterval = null;
  }
  unsubFrame?.();
  unsubResult?.();
  unsubError?.();
  tracker?.dispose();
  camera?.stop();

  if (videoContainer.value) {
    const video = videoContainer.value.querySelector('video');
    if (video) video.remove();
  }

  gazeFilter.reset();
  fps.value = 0;
  inferenceMs.value = 0;
  status.value = 'idle';
}

onMounted(() => {
  start();
});

onUnmounted(() => {
  stop();
});

// Gaze dot position: map -1~+1 to 0%~100%
function gazeStyle() {
  const x = ((gazeX.value + 1) / 2) * 100;
  const y = ((gazeY.value + 1) / 2) * 100;
  return {
    left: `${x}%`,
    top: `${y}%`,
  };
}
</script>

<template>
  <div class="gaze-demo">
    <div ref="videoContainer" class="video-container">
      <!-- Gaze dot overlay -->
      <div
        v-if="status === 'running'"
        class="gaze-dot"
        :style="gazeStyle()"
      />

      <!-- Loading overlay -->
      <div v-if="status === 'loading'" class="overlay">
        <p>Loading MediaPipe model...</p>
      </div>

      <!-- Error overlay -->
      <div v-if="status === 'error'" class="overlay error">
        <p>{{ errorMsg }}</p>
        <button @click="start()">Retry</button>
      </div>
    </div>

    <!-- Debug panel -->
    <div class="debug-panel">
      <div class="debug-row">
        <span class="label">FPS</span>
        <span class="value">{{ fps }}</span>
      </div>
      <div class="debug-row">
        <span class="label">Inference</span>
        <span class="value">{{ inferenceMs }}ms</span>
      </div>
      <div class="debug-row">
        <span class="label">Gaze</span>
        <span class="value">x:{{ gazeX.toFixed(2) }} y:{{ gazeY.toFixed(2) }}</span>
      </div>
      <div class="debug-row">
        <span class="label">Head</span>
        <span class="value">Y:{{ headYaw }}° P:{{ headPitch }}° R:{{ headRoll }}°</span>
      </div>
      <div class="debug-row">
        <span class="label">Status</span>
        <span class="value" :class="status">{{ status }}</span>
      </div>
    </div>

    <div class="controls">
      <button v-if="status === 'running'" @click="stop()">Stop</button>
      <button v-if="status === 'idle'" @click="start()">Start</button>
    </div>
  </div>
</template>

<style scoped>
.gaze-demo {
  max-width: 640px;
  margin: 0 auto;
  font-family: system-ui, -apple-system, sans-serif;
}

.video-container {
  position: relative;
  width: 100%;
  aspect-ratio: 4 / 3;
  background: #111;
  border-radius: 8px;
  overflow: hidden;
}

.gaze-dot {
  position: absolute;
  width: 20px;
  height: 20px;
  background: rgba(255, 50, 50, 0.8);
  border: 2px solid white;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  pointer-events: none;
  transition: left 0.05s linear, top 0.05s linear;
  z-index: 10;
}

.overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.7);
  color: white;
  z-index: 20;
}

.overlay.error {
  color: #ff6b6b;
}

.overlay button {
  margin-top: 12px;
  padding: 8px 16px;
  border: 1px solid currentColor;
  background: transparent;
  color: inherit;
  border-radius: 4px;
  cursor: pointer;
}

.debug-panel {
  margin-top: 12px;
  padding: 12px;
  background: #1a1a2e;
  border-radius: 8px;
  color: #e0e0e0;
  font-size: 13px;
  font-family: 'Consolas', 'Monaco', monospace;
}

.debug-row {
  display: flex;
  justify-content: space-between;
  padding: 2px 0;
}

.label {
  color: #888;
}

.value {
  color: #4fc3f7;
}

.value.running {
  color: #66bb6a;
}

.value.loading {
  color: #ffb74d;
}

.value.error {
  color: #ef5350;
}

.controls {
  margin-top: 12px;
  text-align: center;
}

.controls button {
  padding: 10px 24px;
  border: none;
  background: #4a90d9;
  color: white;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
}

.controls button:hover {
  background: #3a7bc8;
}
</style>
