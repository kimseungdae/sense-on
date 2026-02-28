declare function importScripts(...urls: string[]): void;

type Point3D = { x: number; y: number; z: number };
type Point2D = { x: number; y: number };
type EulerAngles = { yaw: number; pitch: number; roll: number };
type GazeFeatures = {
  leftGaze: Point2D;
  rightGaze: Point2D;
  headYaw: number;
  headPitch: number;
};

interface TrackingResult {
  gazeFeatures: GazeFeatures;
  gazeRatio?: Point2D;
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

// --- Inline: gaze features (eye-in-head + landmark head pose) ---
function computeGazeFeatures(landmarks: Point3D[]): GazeFeatures {
  if (landmarks.length < 478) {
    return {
      leftGaze: { x: 0, y: 0 },
      rightGaze: { x: 0, y: 0 },
      headYaw: 0,
      headPitch: 0,
    };
  }
  const li = landmarks[468]!;
  const ri = landmarks[473]!;
  const lIn = landmarks[133]!;
  const lOut = landmarks[33]!;
  const rIn = landmarks[362]!;
  const rOut = landmarks[263]!;
  const nose = landmarks[1]!;
  const cheekL = landmarks[234]!;
  const cheekR = landmarks[454]!;
  const forehead = landmarks[10]!;
  const chin = landmarks[152]!;

  const lCenterX = (lIn.x + lOut.x) / 2;
  const lCenterY = (lIn.y + lOut.y) / 2;
  const lWidth = Math.hypot(lIn.x - lOut.x, lIn.y - lOut.y);
  const safeLW = lWidth > 0.001 ? lWidth : 0.001;

  const rCenterX = (rIn.x + rOut.x) / 2;
  const rCenterY = (rIn.y + rOut.y) / 2;
  const rWidth = Math.hypot(rIn.x - rOut.x, rIn.y - rOut.y);
  const safeRW = rWidth > 0.001 ? rWidth : 0.001;

  const faceMidX = (cheekL.x + cheekR.x) / 2;
  const faceWidth = Math.abs(cheekR.x - cheekL.x);
  const safeFW = faceWidth > 0.001 ? faceWidth : 0.001;

  const eyeMidY = (lCenterY + rCenterY) / 2;
  const faceHeight = Math.abs(chin.y - forehead.y);
  const safeFH = faceHeight > 0.001 ? faceHeight : 0.001;

  return {
    leftGaze: {
      x: (li.x - lCenterX) / safeLW,
      y: (li.y - lCenterY) / safeLW,
    },
    rightGaze: {
      x: (ri.x - rCenterX) / safeRW,
      y: (ri.y - rCenterY) / safeRW,
    },
    headYaw: (nose.x - faceMidX) / safeFW,
    headPitch: (nose.y - eyeMidY) / safeFH,
  };
}

// --- Inline: gaze ratio (for GazeDemo backward compat) ---
function computeGazeRatio(landmarks: Point3D[]): Point2D {
  if (landmarks.length < 478) return { x: 0, y: 0 };
  const li = landmarks[468]!,
    lIn = landmarks[133]!,
    lOut = landmarks[33]!;
  const ri = landmarks[473]!,
    rIn = landmarks[362]!,
    rOut = landmarks[263]!;
  const lDx = lOut.x - lIn.x,
    rDx = rOut.x - rIn.x;
  const lRx = lDx !== 0 ? (li.x - lIn.x) / lDx : 0.5;
  const rRx = rDx !== 0 ? (ri.x - rIn.x) / rDx : 0.5;
  const lTop = landmarks[159]!,
    lBot = landmarks[145]!;
  const rTop = landmarks[386]!,
    rBot = landmarks[374]!;
  const lDy = lBot.y - lTop.y,
    rDy = rBot.y - rTop.y;
  const lRy = lDy !== 0 ? (li.y - lTop.y) / lDy : 0.5;
  const rRy = rDy !== 0 ? (ri.y - rTop.y) / rDy : 0.5;
  return { x: lRx + rRx - 1, y: lRy + rRy - 1 };
}

// --- Inline: head pose (for GazeDemo backward compat) ---
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

// --- Load script via fetch + blob (bypasses CDN MIME type issues) ---
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
  // CJS shim: vision_bundle.cjs writes to module.exports
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
    // GPU delegate unavailable — fallback to CPU
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
    reply({
      type: "result",
      id,
      data: {
        gazeFeatures: {
          leftGaze: { x: 0, y: 0 },
          rightGaze: { x: 0, y: 0 },
          headYaw: 0,
          headPitch: 0,
        },
        inferenceMs,
        timestamp,
      },
    });
    return;
  }

  const landmarks: Point3D[] = result.faceLandmarks[0];
  const gazeFeatures = computeGazeFeatures(landmarks);
  const gazeRatio = computeGazeRatio(landmarks);

  let headPose: EulerAngles = { yaw: 0, pitch: 0, roll: 0 };
  if (result.facialTransformationMatrixes?.length > 0) {
    const matrix = result.facialTransformationMatrixes[0].data;
    headPose = matrixToEuler(Array.from(matrix));
  }

  reply({
    type: "result",
    id,
    data: {
      gazeFeatures,
      gazeRatio,
      headPose,
      landmarks,
      inferenceMs,
      timestamp,
    },
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
