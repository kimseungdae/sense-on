import type { Point2D } from "./types";

export interface AffineTransform {
  a: number;
  b: number;
  c: number; // sx = a*gx + b*gy + c
  d: number;
  e: number;
  f: number; // sy = d*gx + e*gy + f
}

export interface CalibrationSample {
  gaze: Point2D; // gazeRatio from tracker
  screen: Point2D; // known screen coordinate
}

type Row3 = [number, number, number];
type Mat3 = [Row3, Row3, Row3];

// Solve 3x3 system via Cramer's rule
function solve3x3(A: Mat3, b: Row3): Row3 | null {
  const [a0, a1, a2] = A;
  const det =
    a0[0] * (a1[1] * a2[2] - a1[2] * a2[1]) -
    a0[1] * (a1[0] * a2[2] - a1[2] * a2[0]) +
    a0[2] * (a1[0] * a2[1] - a1[1] * a2[0]);

  if (Math.abs(det) < 1e-12) return null;

  const x =
    (b[0] * (a1[1] * a2[2] - a1[2] * a2[1]) -
      a0[1] * (b[1] * a2[2] - a1[2] * b[2]) +
      a0[2] * (b[1] * a2[1] - a1[1] * b[2])) /
    det;

  const y =
    (a0[0] * (b[1] * a2[2] - a1[2] * b[2]) -
      b[0] * (a1[0] * a2[2] - a1[2] * a2[0]) +
      a0[2] * (a1[0] * b[2] - b[1] * a2[0])) /
    det;

  const z =
    (a0[0] * (a1[1] * b[2] - b[1] * a2[1]) -
      a0[1] * (a1[0] * b[2] - b[1] * a2[0]) +
      b[0] * (a1[0] * a2[1] - a1[1] * a2[0])) /
    det;

  return [x, y, z];
}

// Least-squares affine transform from calibration samples
// Normal equation: (AᵀA)p = Aᵀb for each of sx, sy independently
export function computeAffineTransform(
  samples: CalibrationSample[],
): AffineTransform | null {
  const n = samples.length;
  if (n < 3) return null;

  // Build AᵀA and Aᵀb for both x and y
  let sumGx2 = 0,
    sumGy2 = 0,
    sumGxGy = 0;
  let sumGx = 0,
    sumGy = 0;
  let sumSxGx = 0,
    sumSxGy = 0,
    sumSx = 0;
  let sumSyGx = 0,
    sumSyGy = 0,
    sumSy = 0;

  for (const s of samples) {
    const gx = s.gaze.x,
      gy = s.gaze.y;
    const sx = s.screen.x,
      sy = s.screen.y;
    sumGx2 += gx * gx;
    sumGy2 += gy * gy;
    sumGxGy += gx * gy;
    sumGx += gx;
    sumGy += gy;
    sumSxGx += sx * gx;
    sumSxGy += sx * gy;
    sumSx += sx;
    sumSyGx += sy * gx;
    sumSyGy += sy * gy;
    sumSy += sy;
  }

  const M: Mat3 = [
    [sumGx2, sumGxGy, sumGx],
    [sumGxGy, sumGy2, sumGy],
    [sumGx, sumGy, n],
  ];

  const abc = solve3x3(M, [sumSxGx, sumSxGy, sumSx]);
  const def_ = solve3x3(M, [sumSyGx, sumSyGy, sumSy]);

  if (!abc || !def_) return null;

  return {
    a: abc[0],
    b: abc[1],
    c: abc[2],
    d: def_[0],
    e: def_[1],
    f: def_[2],
  };
}

export function applyTransform(t: AffineTransform, gaze: Point2D): Point2D {
  return {
    x: t.a * gaze.x + t.b * gaze.y + t.c,
    y: t.d * gaze.x + t.e * gaze.y + t.f,
  };
}
