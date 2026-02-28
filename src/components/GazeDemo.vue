<script setup lang="ts">
import { ref, shallowRef, onMounted, onUnmounted } from 'vue';
import { createCameraStream, createTrackerClient, createPointFilter } from '../core';
import type { TrackingResult, Point3D } from '../core';
import {
  TESSELATION, LEFT_EYE, RIGHT_EYE,
  LEFT_IRIS, RIGHT_IRIS, LIPS, FACE_OVAL,
} from '../core/face-connections';

const videoContainer = ref<HTMLDivElement>();
const canvas = ref<HTMLCanvasElement>();
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
const GAZE_GAIN = 2.5;

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

// --- Wireframe rendering ---
function drawWireframe(ctx: CanvasRenderingContext2D, landmarks: Point3D[], w: number, h: number) {
  ctx.clearRect(0, 0, w, h);

  // Mirror x for selfie view
  const lx = (p: Point3D) => (1 - p.x) * w;
  const ly = (p: Point3D) => p.y * h;

  // Depth-based alpha: z is negative=closer, positive=farther
  const zValues = landmarks.map(p => p.z);
  const zMin = Math.min(...zValues);
  const zMax = Math.max(...zValues);
  const zRange = zMax - zMin || 1;
  const depthAlpha = (p: Point3D) => {
    const t = 1 - (p.z - zMin) / zRange; // closer = brighter
    return 0.15 + t * 0.45; // 0.15 ~ 0.6
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

  // Tessellation mesh — subtle, thin
  drawConnections(TESSELATION, 'rgba(0,220,255,A)', 0.5, 0.6);

  // Face oval
  drawConnections(FACE_OVAL, 'rgba(100,255,200,A)', 1.2, 1.0);

  // Eyes
  drawConnections(LEFT_EYE, 'rgba(0,255,150,A)', 1.5, 1.0);
  drawConnections(RIGHT_EYE, 'rgba(0,255,150,A)', 1.5, 1.0);

  // Iris — bright
  drawConnections(LEFT_IRIS, 'rgba(255,100,100,A)', 2, 1.0);
  drawConnections(RIGHT_IRIS, 'rgba(255,100,100,A)', 2, 1.0);

  // Iris center dots
  for (const idx of [468, 473]) {
    const p = landmarks[idx];
    if (!p) continue;
    ctx.fillStyle = `rgba(255,80,80,${depthAlpha(p)})`;
    ctx.beginPath();
    ctx.arc(lx(p), ly(p), 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // Lips
  drawConnections(LIPS, 'rgba(255,150,200,A)', 1.2, 0.9);
}

function handleResult(data: TrackingResult) {
  frameCount++;
  inferenceMs.value = Math.round(data.inferenceMs);

  const gaze = data.gazeRatio ?? { x: 0, y: 0 };
  const filtered = gazeFilter.filter(gaze, data.timestamp);
  const clamp = (v: number) => Math.max(-1, Math.min(1, v));
  gazeX.value = clamp(filtered.x * GAZE_GAIN);
  gazeY.value = clamp(filtered.y * GAZE_GAIN);

  const hp = data.headPose ?? { yaw: 0, pitch: 0, roll: 0 };
  headYaw.value = Math.round(hp.yaw);
  headPitch.value = Math.round(hp.pitch);
  headRoll.value = Math.round(hp.roll);

  // Draw face wireframe
  if (data.landmarks && canvas.value) {
    const ctx = canvas.value.getContext('2d');
    if (ctx) {
      const w = canvas.value.width;
      const h = canvas.value.height;
      drawWireframe(ctx, data.landmarks, w, h);
    }
  }
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

    // Size canvas to match video
    if (canvas.value) {
      canvas.value.width = 640;
      canvas.value.height = 480;
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

  if (canvas.value) {
    const ctx = canvas.value.getContext('2d');
    ctx?.clearRect(0, 0, canvas.value.width, canvas.value.height);
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
      <!-- Wireframe canvas overlay -->
      <canvas ref="canvas" class="wireframe-canvas" />

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

.wireframe-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 5;
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
