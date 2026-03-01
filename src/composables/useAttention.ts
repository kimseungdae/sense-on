import { ref, computed, readonly } from "vue";
import {
  computeAttention,
  type AttentionState,
  type AttentionResult,
} from "../core/attention";
import { createOneEuroFilter } from "../core/filter";
import type { TrackingResult } from "../core/types";

const DEBOUNCE_MS = 300;
const DROWSY_HOLD_MS = 2000;

const state = ref<AttentionState>("absent");
const raw = ref<AttentionResult>({
  state: "absent",
  headYaw: 0,
  headPitch: 0,
  eyeOpenness: 0,
  facePresent: false,
});

const attentiveMs = ref(0);
const totalMs = ref(0);
const distractionCount = ref(0);
const currentStreakMs = ref(0);
const sessionStart = ref(0);

let lastTimestamp = 0;
let pendingState: AttentionState | null = null;
let pendingAt = 0;
let eyeClosedSince = 0;

const yawFilter = createOneEuroFilter({ minCutoff: 1.0, beta: 0.3 });
const pitchFilter = createOneEuroFilter({ minCutoff: 1.0, beta: 0.3 });

export function useAttention() {
  const attentionRate = computed(() =>
    totalMs.value > 0 ? attentiveMs.value / totalMs.value : 0,
  );

  function processResult(data: TrackingResult) {
    const now = data.timestamp;

    if (data.headPose) {
      data = {
        ...data,
        headPose: {
          yaw: yawFilter.filter(data.headPose.yaw, now),
          pitch: pitchFilter.filter(data.headPose.pitch, now),
          roll: data.headPose.roll,
        },
      };
    }

    const result = computeAttention(data);
    raw.value = result;

    let candidate = result.state;
    if (candidate === "drowsy") {
      if (eyeClosedSince === 0) eyeClosedSince = now;
      if (now - eyeClosedSince < DROWSY_HOLD_MS) candidate = "attentive";
    } else {
      eyeClosedSince = 0;
    }

    if (candidate !== state.value) {
      if (pendingState !== candidate) {
        pendingState = candidate;
        pendingAt = now;
      } else if (now - pendingAt >= DEBOUNCE_MS) {
        const prev = state.value;
        state.value = candidate;
        pendingState = null;

        if (prev === "attentive" && candidate !== "attentive") {
          distractionCount.value++;
        }
        if (candidate === "attentive") {
          currentStreakMs.value = 0;
        }
      }
    } else {
      pendingState = null;
    }

    if (lastTimestamp > 0 && sessionStart.value > 0) {
      const dt = now - lastTimestamp;
      if (dt > 0 && dt < 1000) {
        totalMs.value += dt;
        if (state.value === "attentive") {
          attentiveMs.value += dt;
          currentStreakMs.value += dt;
        }
      }
    }
    lastTimestamp = now;
  }

  function reset() {
    state.value = "absent";
    attentiveMs.value = 0;
    totalMs.value = 0;
    distractionCount.value = 0;
    currentStreakMs.value = 0;
    sessionStart.value = performance.now();
    lastTimestamp = 0;
    pendingState = null;
    eyeClosedSince = 0;
    yawFilter.reset();
    pitchFilter.reset();
  }

  return {
    state: readonly(state),
    raw: readonly(raw),
    attentiveMs: readonly(attentiveMs),
    totalMs: readonly(totalMs),
    distractionCount: readonly(distractionCount),
    currentStreakMs: readonly(currentStreakMs),
    attentionRate,
    processResult,
    reset,
  };
}
