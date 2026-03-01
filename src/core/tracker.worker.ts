declare function importScripts(...urls: string[]): void;

type Point3D = { x: number; y: number; z: number };
type Point2D = { x: number; y: number };
type EulerAngles = { yaw: number; pitch: number; roll: number };

interface TrackingResult {
  faceCenter?: Point2D;
  headPose?: EulerAngles;
  landmarks?: Point3D[];
  inferenceMs: number;
  timestamp: number;
}

type WorkerInMsg =
  | { type: "init"; config: { wasmPath: string; modelPath: string } }
  | { type: "detect"; frame: ImageBitmap; timestamp: number; id: number }
  | { type: "dispose" };

type WorkerOutMsg =
  | { type: "ready" }
  | { type: "result"; id: number; data: TrackingResult }
  | { type: "error"; message: string };

// --- head pose from transformation matrix ---
function matrixToEuler(m: number[]): EulerAngles {
  const clamp = (v: number, lo: number, hi: number) =>
    v < lo ? lo : v > hi ? hi : v;
  const D = 180 / Math.PI;
  const r20 = m[2] ?? 0,
    r21 = m[6] ?? 0,
    r22 = m[10] ?? 1;
  const r10 = m[1] ?? 0,
    r00 = m[0] ?? 1;
  return {
    yaw: Math.asin(-clamp(r20, -1, 1)) * D,
    pitch: Math.atan2(r21, r22) * D,
    roll: Math.atan2(r10, r00) * D,
  };
}

// --- Load script via fetch + blob ---
async function loadScript(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  const code = await res.text();
  const blob = new Blob([code], { type: "application/javascript" });
  const blobUrl = URL.createObjectURL(blob);
  importScripts(blobUrl);
  URL.revokeObjectURL(blobUrl);
}

// --- Worker logic ---
let faceLandmarker: any = null;

async function init(wasmPath: string, modelPath: string) {
  const g = self as any;
  g.exports = {};
  g.module = { exports: g.exports };

  const cdnBase = wasmPath.replace(/\/wasm\/?$/, "");
  await loadScript(`${cdnBase}/vision_bundle.cjs`);
  const mp = g.module.exports;

  const vision = await mp.FilesetResolver.forVisionTasks(wasmPath);
  const opts = {
    baseOptions: {
      modelAssetPath: modelPath,
      delegate: "GPU" as const,
    },
    runningMode: "VIDEO" as const,
    numFaces: 1,
    outputFacialTransformationMatrixes: true,
  };
  try {
    faceLandmarker = await mp.FaceLandmarker.createFromOptions(vision, opts);
  } catch {
    opts.baseOptions.delegate = "CPU" as any;
    faceLandmarker = await mp.FaceLandmarker.createFromOptions(vision, opts);
  }
}

function detect(frame: ImageBitmap, timestamp: number, id: number) {
  if (!faceLandmarker) {
    reply({ type: "error", message: "Not initialized" });
    return;
  }

  const t0 = performance.now();
  const result = faceLandmarker.detectForVideo(frame, timestamp);
  const inferenceMs = performance.now() - t0;
  frame.close();

  if (!result.faceLandmarks || result.faceLandmarks.length === 0) {
    reply({ type: "result", id, data: { inferenceMs, timestamp } });
    return;
  }

  const landmarks: Point3D[] = result.faceLandmarks[0];
  const nose = landmarks[1]!;
  const faceCenter: Point2D = { x: nose.x, y: nose.y };

  let headPose: EulerAngles = { yaw: 0, pitch: 0, roll: 0 };
  if (result.facialTransformationMatrixes?.length > 0) {
    const matrix = result.facialTransformationMatrixes[0].data;
    headPose = matrixToEuler(Array.from(matrix));
  }

  reply({
    type: "result",
    id,
    data: { faceCenter, headPose, landmarks, inferenceMs, timestamp },
  });
}

function reply(msg: WorkerOutMsg) {
  self.postMessage(msg);
}

self.onmessage = async (e: MessageEvent<WorkerInMsg>) => {
  const msg = e.data;
  try {
    switch (msg.type) {
      case "init":
        await init(msg.config.wasmPath, msg.config.modelPath);
        reply({ type: "ready" });
        break;
      case "detect":
        detect(msg.frame, msg.timestamp, msg.id);
        break;
      case "dispose":
        faceLandmarker?.close();
        faceLandmarker = null;
        break;
    }
  } catch (err) {
    reply({
      type: "error",
      message: err instanceof Error ? err.message : String(err),
    });
  }
};
