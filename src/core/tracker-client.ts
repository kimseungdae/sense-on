import type {
  TrackerClientOptions,
  TrackingResult,
  WorkerOutMsg,
} from "./types";

const DEFAULT_WASM_PATH =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm";
const DEFAULT_MODEL_PATH = "/models/face_landmarker.task";

export interface TrackerClient {
  init(): Promise<void>;
  detect(frame: ImageBitmap, timestamp: number): void;
  dispose(): void;
  onResult(cb: (data: TrackingResult) => void): () => void;
  onError(cb: (message: string) => void): () => void;
}

export function createTrackerClient(
  options: TrackerClientOptions = {},
): TrackerClient {
  const wasmPath = options.wasmPath ?? DEFAULT_WASM_PATH;
  const modelPath = options.modelPath ?? DEFAULT_MODEL_PATH;

  const worker = new Worker(new URL("./tracker.worker.ts", import.meta.url));

  let nextId = 0;
  let latestSentId = -1;

  const resultCbs = new Set<(data: TrackingResult) => void>();
  const errorCbs = new Set<(message: string) => void>();

  worker.onmessage = (e: MessageEvent<WorkerOutMsg>) => {
    const msg = e.data;
    if (msg.type === "result") {
      if (msg.id < latestSentId) return; // stale result
      for (const cb of resultCbs) cb(msg.data);
    } else if (msg.type === "error") {
      for (const cb of errorCbs) cb(msg.message);
    }
  };

  return {
    init() {
      return new Promise<void>((resolve, reject) => {
        const handler = (e: MessageEvent<WorkerOutMsg>) => {
          if (e.data.type === "ready") {
            worker.removeEventListener("message", handler);
            resolve();
          } else if (e.data.type === "error") {
            worker.removeEventListener("message", handler);
            reject(new Error(e.data.message));
          }
        };
        worker.addEventListener("message", handler);
        worker.postMessage({
          type: "init",
          config: { wasmPath, modelPath },
        });
      });
    },

    detect(frame: ImageBitmap, timestamp: number) {
      const id = nextId++;
      latestSentId = id;
      worker.postMessage({ type: "detect", frame, timestamp, id }, [frame]);
    },

    dispose() {
      worker.postMessage({ type: "dispose" });
      worker.terminate();
      resultCbs.clear();
      errorCbs.clear();
    },

    onResult(cb) {
      resultCbs.add(cb);
      return () => {
        resultCbs.delete(cb);
      };
    },

    onError(cb) {
      errorCbs.add(cb);
      return () => {
        errorCbs.delete(cb);
      };
    },
  };
}
