declare function importScripts(...urls: string[]): void;
declare const self: {
  FilesetResolver: any;
  FaceLandmarker: any;
  postMessage(msg: any): void;
  onmessage: ((e: MessageEvent) => void) | null;
};

type Point3D = { x: number; y: number; z: number };
type Point2D = { x: number; y: number };
type EulerAngles = { yaw: number; pitch: number; roll: number };

interface TrackingResult {
  gazeRatio: Point2D;
  headPose: EulerAngles;
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

// --- Inline: gaze ratio computation ---
const LEFT_EYE_INNER = 133;
const LEFT_EYE_OUTER = 33;
const RIGHT_EYE_INNER = 362;
const RIGHT_EYE_OUTER = 263;
const LEFT_IRIS_CENTER = 468;
const RIGHT_IRIS_CENTER = 473;
const LEFT_EYE_TOP = 159;
const LEFT_EYE_BOTTOM = 145;
const RIGHT_EYE_TOP = 386;
const RIGHT_EYE_BOTTOM = 374;

function computeGazeRatio(landmarks: Point3D[]): Point2D {
  if (landmarks.length < 478) return { x: 0, y: 0 };

  const li = landmarks[LEFT_IRIS_CENTER]!;
  const lInner = landmarks[LEFT_EYE_INNER]!;
  const lOuter = landmarks[LEFT_EYE_OUTER]!;
  const ri = landmarks[RIGHT_IRIS_CENTER]!;
  const rInner = landmarks[RIGHT_EYE_INNER]!;
  const rOuter = landmarks[RIGHT_EYE_OUTER]!;

  const lDx = lOuter.x - lInner.x;
  const rDx = rOuter.x - rInner.x;
  const lRatioX = lDx !== 0 ? (li.x - lInner.x) / lDx : 0.5;
  const rRatioX = rDx !== 0 ? (ri.x - rInner.x) / rDx : 0.5;
  const gazeX = lRatioX + rRatioX - 1;

  const lTop = landmarks[LEFT_EYE_TOP]!;
  const lBot = landmarks[LEFT_EYE_BOTTOM]!;
  const rTop = landmarks[RIGHT_EYE_TOP]!;
  const rBot = landmarks[RIGHT_EYE_BOTTOM]!;
  const lDy = lBot.y - lTop.y;
  const rDy = rBot.y - rTop.y;
  const lRatioY = lDy !== 0 ? (li.y - lTop.y) / lDy : 0.5;
  const rRatioY = rDy !== 0 ? (ri.y - rTop.y) / rDy : 0.5;
  const gazeY = lRatioY + rRatioY - 1;

  return { x: gazeX, y: gazeY };
}

// --- Inline: head pose from 4x4 matrix ---
const RAD2DEG = 180 / Math.PI;

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function matrixToEuler(m: number[]): EulerAngles {
  const r20 = m[2] ?? 0;
  const r21 = m[6] ?? 0;
  const r22 = m[10] ?? 1;
  const r10 = m[1] ?? 0;
  const r00 = m[0] ?? 1;
  const yaw = Math.asin(-clamp(r20, -1, 1)) * RAD2DEG;
  const pitch = Math.atan2(r21, r22) * RAD2DEG;
  const roll = Math.atan2(r10, r00) * RAD2DEG;
  return { yaw, pitch, roll };
}

// --- Worker logic ---
let faceLandmarker: any = null;

async function init(wasmPath: string, modelPath: string) {
  // CJS shim: vision_bundle.cjs writes to module.exports
  const g = self as any;
  g.exports = {};
  g.module = { exports: g.exports };
  const cdnBase = wasmPath.replace(/\/wasm\/?$/, "");
  importScripts(`${cdnBase}/vision_bundle.cjs`);
  const mp = g.module.exports;

  const vision = await mp.FilesetResolver.forVisionTasks(wasmPath);
  faceLandmarker = await mp.FaceLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: modelPath,
      delegate: "GPU",
    },
    runningMode: "VIDEO",
    numFaces: 1,
    outputFacialTransformationMatrixes: true,
  });
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
    reply({
      type: "result",
      id,
      data: {
        gazeRatio: { x: 0, y: 0 },
        headPose: { yaw: 0, pitch: 0, roll: 0 },
        inferenceMs,
        timestamp,
      },
    });
    return;
  }

  const landmarks: Point3D[] = result.faceLandmarks[0];
  const gazeRatio = computeGazeRatio(landmarks);

  let headPose: EulerAngles = { yaw: 0, pitch: 0, roll: 0 };
  if (result.facialTransformationMatrixes?.length > 0) {
    const matrix = result.facialTransformationMatrixes[0].data;
    headPose = matrixToEuler(Array.from(matrix));
  }

  const data: TrackingResult = {
    gazeRatio,
    headPose,
    inferenceMs,
    timestamp,
  };

  reply({ type: "result", id, data });
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
