<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import GazeOverlay from '../components/GazeOverlay.vue';
import { useTracker } from '../composables/useTracker';
import { useCalibration } from '../composables/useCalibration';

const router = useRouter();
const { status, stop } = useTracker();
const { transform, clear } = useCalibration();

const activeLineIndex = ref(-1);
const lineEls = ref<HTMLElement[]>([]);
const contentEl = ref<HTMLElement | null>(null);

const paragraphs = [
  'The human visual system is one of the most complex sensory systems in the body. Light enters through the cornea, passes through the pupil, and is focused by the lens onto the retina at the back of the eye.',
  'The retina contains two types of photoreceptor cells: rods and cones. Rods are responsible for vision in low-light conditions, while cones enable color vision and are concentrated in the fovea, the central region of the retina.',
  'Eye movements play a crucial role in visual perception. Saccades are rapid eye movements that shift the point of fixation from one location to another. Between saccades, the eyes remain relatively still during periods called fixations, which typically last 200-300 milliseconds.',
  'During reading, the eyes do not move smoothly across the text. Instead, they make a series of saccades and fixations. Most fixations during reading last about 225 milliseconds, and the average saccade length is about 7-9 letter spaces.',
  'Gaze tracking technology has evolved significantly over the past decades. Modern webcam-based systems can estimate gaze direction by analyzing the position of the iris relative to the eye corners, combined with head pose estimation.',
  'Calibration is essential for accurate gaze tracking. By mapping the relationship between eye features and known screen positions, we can create a mathematical model that translates eye measurements into screen coordinates.',
  'Applications of gaze tracking span many fields: accessibility tools for people with motor disabilities, user experience research, reading comprehension analysis, driver attention monitoring, and interactive gaming interfaces.',
];

function findActiveLine(screenY: number) {
  if (!lineEls.value.length) return;

  let closest = -1;
  let minDist = Infinity;

  for (let i = 0; i < lineEls.value.length; i++) {
    const el = lineEls.value[i]!;
    const rect = el.getBoundingClientRect();
    const centerY = rect.top + rect.height / 2;
    const dist = Math.abs(screenY - centerY);
    if (dist < minDist) {
      minDist = dist;
      closest = i;
    }
  }

  // Only highlight if within reasonable distance (80px for zone-based)
  activeLineIndex.value = minDist < 80 ? closest : -1;
}

function onZone({ row }: { row: number; col: number }) {
  const cellH = window.innerHeight / 32;
  const centerY = (row + 0.5) * cellH;
  findActiveLine(centerY);
}

function exitReader() {
  stop();
  clear();
  document.exitFullscreen?.().catch(() => {});
  router.push('/');
}

onMounted(async () => {
  if (status.value !== 'running' || !transform.value) {
    router.push('/');
    return;
  }

  await nextTick();

  // Collect line elements
  if (contentEl.value) {
    lineEls.value = Array.from(contentEl.value.querySelectorAll('.line'));
  }
});
</script>

<template>
  <div class="reader">
    <GazeOverlay @zone="onZone" />

    <header class="reader-header">
      <button class="exit-btn" @click="exitReader">✕ Exit</button>
      <span class="title">Reading Tracker</span>
    </header>

    <div ref="contentEl" class="content">
      <p
        v-for="(text, i) in paragraphs"
        :key="i"
        class="line"
        :class="{ active: i === activeLineIndex }"
      >
        {{ text }}
      </p>
    </div>
  </div>
</template>

<style scoped>
.reader {
  position: fixed;
  inset: 0;
  background: #0d1117;
  overflow-y: auto;
  color: #e6edf3;
}

.reader-header {
  position: sticky;
  top: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 20px;
  background: #0d1117ee;
  backdrop-filter: blur(8px);
  z-index: 10;
  border-bottom: 1px solid #1e2a3a;
}

.exit-btn {
  background: #1e2a3a;
  color: #8ba4c0;
  border: 1px solid #2d3f54;
  border-radius: 6px;
  padding: 6px 14px;
  font-size: 13px;
  cursor: pointer;
}

.exit-btn:hover { opacity: 0.85; }

.title {
  font-size: 14px;
  color: #888;
}

.content {
  max-width: 800px;
  margin: 0 auto;
  padding: 40px 24px 80px;
}

.line {
  font-size: 18px;
  line-height: 1.8;
  margin: 0 0 24px;
  padding: 8px 12px;
  border-radius: 6px;
  border-left: 3px solid transparent;
  transition: background 0.2s, border-color 0.2s;
}

.line.active {
  background: rgba(79, 195, 247, 0.08);
  border-left-color: #4fc3f7;
}
</style>
