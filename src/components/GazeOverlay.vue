<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useTracker } from '../composables/useTracker';
import { useCalibration } from '../composables/useCalibration';
import { applyTransform } from '../core/calibration';

const { onResult } = useTracker();
const { transform } = useCalibration();

const dotX = ref(0);
const dotY = ref(0);
const visible = ref(false);

let unsub: (() => void) | null = null;

onMounted(() => {
  unsub = onResult((data) => {
    if (!transform.value) return;
    const pos = applyTransform(transform.value, data.gazeRatio);
    dotX.value = pos.x;
    dotY.value = pos.y;
    visible.value = true;
  });
});

onUnmounted(() => {
  unsub?.();
});
</script>

<template>
  <div
    v-show="visible"
    class="gaze-dot"
    :style="{ left: dotX + 'px', top: dotY + 'px' }"
  />
</template>

<style scoped>
.gaze-dot {
  position: fixed;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: rgba(255, 50, 50, 0.85);
  box-shadow: 0 0 10px rgba(255, 50, 50, 0.6);
  transform: translate(-50%, -50%);
  pointer-events: none;
  z-index: 9999;
  transition: left 0.05s linear, top 0.05s linear;
}
</style>
