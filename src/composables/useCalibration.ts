import { ref, readonly } from "vue";
import type { GazeTransform } from "../core/calibration";

const transform = ref<GazeTransform | null>(null);

export function useCalibration() {
  function setTransform(t: GazeTransform) {
    transform.value = t;
  }

  function clear() {
    transform.value = null;
  }

  return {
    transform: readonly(transform),
    setTransform,
    clear,
  };
}
