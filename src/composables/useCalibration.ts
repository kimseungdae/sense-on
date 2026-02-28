import { ref, readonly } from "vue";
import type { AffineTransform } from "../core/calibration";

const transform = ref<AffineTransform | null>(null);

export function useCalibration() {
  function setTransform(t: AffineTransform) {
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
