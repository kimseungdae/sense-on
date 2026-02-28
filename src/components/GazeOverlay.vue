<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useTracker } from '../composables/useTracker';
import { useCalibration } from '../composables/useCalibration';
import { applyGazeTransform } from '../core/calibration';

const COLS = 32;
const ROWS = 32;
const DWELL_MS = 150;

const emit = defineEmits<{
  zone: [payload: { row: number; col: number }];
}>();

const { onResult } = useTracker();
const { transform } = useCalibration();

const activeRow = ref(-1);
const activeCol = ref(-1);
const cellW = ref(0);
const cellH = ref(0);
const visible = ref(false);

// Dwell state
let pendingRow = -1;
let pendingCol = -1;
let dwellTimer: ReturnType<typeof setTimeout> | null = null;

function updateCellSize() {
  cellW.value = window.innerWidth / COLS;
  cellH.value = window.innerHeight / ROWS;
}

function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v;
}

let unsub: (() => void) | null = null;

onMounted(() => {
  updateCellSize();
  window.addEventListener('resize', updateCellSize);

  unsub = onResult((data) => {
    if (!transform.value) return;
    const pos = applyGazeTransform(transform.value, data.gazeRatio, data.headPose.yaw, data.headPose.pitch);

    const col = clamp(Math.floor(pos.x / cellW.value), 0, COLS - 1);
    const row = clamp(Math.floor(pos.y / cellH.value), 0, ROWS - 1);

    visible.value = true;

    // Same cell — no change needed
    if (col === activeCol.value && row === activeRow.value) {
      // Reset pending if we came back to active
      if (dwellTimer) {
        clearTimeout(dwellTimer);
        dwellTimer = null;
      }
      return;
    }

    // Already pending this cell — let dwell timer run
    if (col === pendingCol && row === pendingRow) return;

    // New candidate cell — start dwell timer
    pendingCol = col;
    pendingRow = row;
    if (dwellTimer) clearTimeout(dwellTimer);
    dwellTimer = setTimeout(() => {
      activeCol.value = pendingCol;
      activeRow.value = pendingRow;
      emit('zone', { row: activeRow.value, col: activeCol.value });
      dwellTimer = null;
    }, DWELL_MS);
  });
});

onUnmounted(() => {
  unsub?.();
  if (dwellTimer) clearTimeout(dwellTimer);
  window.removeEventListener('resize', updateCellSize);
});
</script>

<template>
  <div class="gaze-grid" v-show="visible">
    <!-- Active cell highlight -->
    <div
      v-if="activeRow >= 0 && activeCol >= 0"
      class="active-cell"
      :style="{
        left: activeCol * cellW + 'px',
        top: activeRow * cellH + 'px',
        width: cellW + 'px',
        height: cellH + 'px',
      }"
    />
  </div>
</template>

<style scoped>
.gaze-grid {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 9999;
}

.active-cell {
  position: absolute;
  background: rgba(79, 195, 247, 0.15);
  border: 1px solid rgba(79, 195, 247, 0.3);
  border-radius: 2px;
  transition: left 0.08s linear, top 0.08s linear;
}
</style>
