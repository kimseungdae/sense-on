import { ref, readonly } from "vue";
import { createCameraStream, type CameraStream } from "../core/camera";
import {
  createTrackerClient,
  type TrackerClient,
} from "../core/tracker-client";
import type { TrackingResult } from "../core/types";

type TrackerStatus = "idle" | "loading" | "running" | "error";

// Module-level singleton — shared across views
let camera: CameraStream | null = null;
let tracker: TrackerClient | null = null;
let frameUnsub: (() => void) | null = null;

const status = ref<TrackerStatus>("idle");
const error = ref<string | null>(null);
const resultCbs = new Set<(data: TrackingResult) => void>();

export function useTracker() {
  async function start() {
    if (status.value === "running") return;

    status.value = "loading";
    error.value = null;

    try {
      camera = createCameraStream();
      tracker = createTrackerClient();

      tracker.onError((msg) => {
        error.value = msg;
        status.value = "error";
      });

      tracker.onResult((data) => {
        for (const cb of resultCbs) cb(data);
      });

      await tracker.init();
      await camera.start();

      frameUnsub = camera.onFrame((frame) => {
        tracker!.detect(frame, performance.now());
      });

      status.value = "running";
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
      status.value = "error";
    }
  }

  function stop() {
    frameUnsub?.();
    frameUnsub = null;
    camera?.stop();
    tracker?.dispose();
    camera = null;
    tracker = null;
    status.value = "idle";
    error.value = null;
    resultCbs.clear();
  }

  function onResult(cb: (data: TrackingResult) => void): () => void {
    resultCbs.add(cb);
    return () => {
      resultCbs.delete(cb);
    };
  }

  function getVideoElement(): HTMLVideoElement | null {
    return camera?.getVideoElement() ?? null;
  }

  return {
    status: readonly(status),
    error: readonly(error),
    start,
    stop,
    onResult,
    getVideoElement,
  };
}
