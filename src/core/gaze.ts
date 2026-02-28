import type { Point2D, Point3D, GazeFeatures } from "./types";

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

const NOSE_TIP = 1;
const LEFT_CHEEK = 234;
const RIGHT_CHEEK = 454;
const FOREHEAD = 10;
const CHIN = 152;

const MIN_LANDMARKS = 478;

export function computeGazeRatio(landmarks: Point3D[]): Point2D {
  if (landmarks.length < MIN_LANDMARKS) {
    return { x: 0, y: 0 };
  }

  const li = landmarks[LEFT_IRIS_CENTER]!;
  const lInner = landmarks[LEFT_EYE_INNER]!;
  const lOuter = landmarks[LEFT_EYE_OUTER]!;

  const ri = landmarks[RIGHT_IRIS_CENTER]!;
  const rInner = landmarks[RIGHT_EYE_INNER]!;
  const rOuter = landmarks[RIGHT_EYE_OUTER]!;

  // Horizontal: iris position relative to eye corners → 0~1 → -1~+1
  const lDx = lOuter.x - lInner.x;
  const rDx = rOuter.x - rInner.x;

  const lRatioX = lDx !== 0 ? (li.x - lInner.x) / lDx : 0.5;
  const rRatioX = rDx !== 0 ? (ri.x - rInner.x) / rDx : 0.5;
  const gazeX = lRatioX + rRatioX - 1; // average * 2 - 1

  // Vertical: iris position relative to top/bottom eyelid
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

export function computeGazeFeatures(landmarks: Point3D[]): GazeFeatures {
  if (landmarks.length < MIN_LANDMARKS) {
    return {
      leftGaze: { x: 0, y: 0 },
      rightGaze: { x: 0, y: 0 },
      headYaw: 0,
      headPitch: 0,
    };
  }

  const li = landmarks[LEFT_IRIS_CENTER]!;
  const ri = landmarks[RIGHT_IRIS_CENTER]!;
  const lIn = landmarks[LEFT_EYE_INNER]!;
  const lOut = landmarks[LEFT_EYE_OUTER]!;
  const rIn = landmarks[RIGHT_EYE_INNER]!;
  const rOut = landmarks[RIGHT_EYE_OUTER]!;
  const nose = landmarks[NOSE_TIP]!;
  const cheekL = landmarks[LEFT_CHEEK]!;
  const cheekR = landmarks[RIGHT_CHEEK]!;
  const forehead = landmarks[FOREHEAD]!;
  const chin = landmarks[CHIN]!;

  // Eye centers and widths (head-invariant reference frame)
  const lCenterX = (lIn.x + lOut.x) / 2;
  const lCenterY = (lIn.y + lOut.y) / 2;
  const lWidth = Math.hypot(lIn.x - lOut.x, lIn.y - lOut.y);
  const safeLW = lWidth > 0.001 ? lWidth : 0.001;

  const rCenterX = (rIn.x + rOut.x) / 2;
  const rCenterY = (rIn.y + rOut.y) / 2;
  const rWidth = Math.hypot(rIn.x - rOut.x, rIn.y - rOut.y);
  const safeRW = rWidth > 0.001 ? rWidth : 0.001;

  // Head pose from landmark geometry
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
