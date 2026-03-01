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

type EyePatches = { left: Float32Array; right: Float32Array };

interface TrackingResult {
  gazeFeatures: GazeFeatures;
  eyePatches?: EyePatches;
  faceCenter?: Point2D;
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

// --- Inline: eye patch extraction ---
const EYE_PATCH_W = 10;
const EYE_PATCH_H = 6;

let cropCanvas: OffscreenCanvas | null = null;
let cropCtx: OffscreenCanvasRenderingContext2D | null = null;
let patchCanvas: OffscreenCanvas | null = null;
let patchCtx: OffscreenCanvasRenderingContext2D | null = null;

function ensureCanvases() {
  if (!cropCanvas) {
    cropCanvas = new OffscreenCanvas(1, 1);
    cropCtx = cropCanvas.getContext("2d")!;
  }
  if (!patchCanvas) {
    patchCanvas = new OffscreenCanvas(EYE_PATCH_W, EYE_PATCH_H);
    patchCtx = patchCanvas.getContext("2d")!;
  }
}

function extractSingleEye(
  frame: ImageBitmap,
  fw: number,
  fh: number,
  corner1: Point3D,
  corner2: Point3D,
  top: Point3D,
  bottom: Point3D,
): Float32Array | null {
  const xMin = Math.min(corner1.x, corner2.x);
  const xMax = Math.max(corner1.x, corner2.x);
  const yMin = Math.min(top.y, corner1.y, corner2.y);
  const yMax = Math.max(bottom.y, corner1.y, corner2.y);

  const marginX = (xMax - xMin) * 0.2;
  const marginY = (yMax - yMin) * 0.3;

  const sx = Math.max(0, Math.floor((xMin - marginX) * fw));
  const sy = Math.max(0, Math.floor((yMin - marginY) * fh));
  const sw = Math.min(fw - sx, Math.ceil((xMax - xMin + 2 * marginX) * fw));
  const sh = Math.min(fh - sy, Math.ceil((yMax - yMin + 2 * marginY) * fh));

  if (sw <= 0 || sh <= 0) return null;

  cropCanvas!.width = sw;
  cropCanvas!.height = sh;
  cropCtx!.drawImage(frame, sx, sy, sw, sh, 0, 0, sw, sh);

  patchCtx!.drawImage(
    cropCanvas!,
    0,
    0,
    sw,
    sh,
    0,
    0,
    EYE_PATCH_W,
    EYE_PATCH_H,
  );

  const imageData = patchCtx!.getImageData(0, 0, EYE_PATCH_W, EYE_PATCH_H);
  const pixels = imageData.data;
  const patch = new Float32Array(EYE_PATCH_W * EYE_PATCH_H);

  for (let i = 0; i < patch.length; i++) {
    const r = pixels[i * 4]!;
    const g = pixels[i * 4 + 1]!;
    const b = pixels[i * 4 + 2]!;
    patch[i] = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  }

  return patch;
}

function extractEyePatches(
  frame: ImageBitmap,
  landmarks: Point3D[],
): EyePatches | null {
  ensureCanvases();
  const fw = frame.width;
  const fh = frame.height;

  const left = extractSingleEye(
    frame,
    fw,
    fh,
    landmarks[33]!,
    landmarks[133]!,
    landmarks[159]!,
    landmarks[145]!,
  );
  const right = extractSingleEye(
    frame,
    fw,
    fh,
    landmarks[362]!,
    landmarks[263]!,
    landmarks[386]!,
    landmarks[374]!,
  );

  if (!left || !right) return null;
  return { left, right };
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

  if (!result.faceLandmarks || result.faceLandmarks.length === 0) {
    frame.close();
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

  // Extract eye patches BEFORE closing the frame
  const eyePatches = extractEyePatches(frame, landmarks);
  frame.close();

  const nose = landmarks[1]!;
  const faceCenter: Point2D = { x: nose.x, y: nose.y };

  let headPose: EulerAngles = { yaw: 0, pitch: 0, roll: 0 };
  if (result.facialTransformationMatrixes?.length > 0) {
    const matrix = result.facialTransformationMatrixes[0].data;
    headPose = matrixToEuler(Array.from(matrix));
  }

  const data: TrackingResult = {
    gazeFeatures,
    eyePatches: eyePatches ?? undefined,
    faceCenter,
    gazeRatio,
    headPose,
    landmarks,
    inferenceMs,
    timestamp,
  };

  if (eyePatches) {
    (self as any).postMessage({ type: "result", id, data }, [
      eyePatches.left.buffer,
      eyePatches.right.buffer,
    ]);
  } else {
    reply({ type: "result", id, data });
  }
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
