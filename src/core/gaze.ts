import type { Point2D, Point3D } from "./types";

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
