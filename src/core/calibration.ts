import type { Point2D } from "./types";

// 4-input model: sx = a*gx + b*gy + c*yaw + d*pitch + e
export interface GazeTransform {
  readonly xCoeffs: readonly number[]; // [a, b, c, d, e] for screen X
  readonly yCoeffs: readonly number[]; // [a, b, c, d, e] for screen Y
}

export interface CalibrationSample {
  gaze: Point2D;
  yaw: number;
  pitch: number;
  screen: Point2D;
}

const NUM_FEATURES = 4; // gx, gy, yaw, pitch
const NUM_PARAMS = NUM_FEATURES + 1; // + bias

// NxN Gaussian elimination with partial pivoting
function solveLinearSystem(A: number[][], b: number[]): number[] | null {
  const n = A.length;
  const aug = A.map((row, i) => [...row, b[i]!]);

  for (let col = 0; col < n; col++) {
    // Partial pivoting
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(aug[row]![col]!) > Math.abs(aug[maxRow]![col]!)) {
        maxRow = row;
      }
    }
    [aug[col], aug[maxRow]] = [aug[maxRow]!, aug[col]!];

    if (Math.abs(aug[col]![col]!) < 1e-12) return null;

    // Forward elimination
    for (let row = col + 1; row < n; row++) {
      const factor = aug[row]![col]! / aug[col]![col]!;
      for (let j = col; j <= n; j++) {
        aug[row]![j] = aug[row]![j]! - factor * aug[col]![j]!;
      }
    }
  }

  // Back substitution
  const x = new Array<number>(n);
  for (let i = n - 1; i >= 0; i--) {
    x[i] = aug[i]![n]!;
    for (let j = i + 1; j < n; j++) {
      x[i]! -= aug[i]![j]! * x[j]!;
    }
    x[i]! /= aug[i]![i]!;
  }

  return x;
}

function featureRow(s: CalibrationSample): number[] {
  return [s.gaze.x, s.gaze.y, s.yaw, s.pitch, 1];
}

// Least-squares: (AᵀA)p = Aᵀb via Gaussian elimination
export function computeGazeTransform(
  samples: CalibrationSample[],
): GazeTransform | null {
  const n = samples.length;
  if (n < NUM_PARAMS) return null;

  // Build AᵀA (5x5) and Aᵀbx, Aᵀby (5x1)
  const AtA: number[][] = Array.from({ length: NUM_PARAMS }, () =>
    new Array(NUM_PARAMS).fill(0),
  );
  const Atbx = new Array<number>(NUM_PARAMS).fill(0);
  const Atby = new Array<number>(NUM_PARAMS).fill(0);

  for (const s of samples) {
    const f = featureRow(s);
    for (let i = 0; i < NUM_PARAMS; i++) {
      for (let j = 0; j < NUM_PARAMS; j++) {
        AtA[i]![j]! += f[i]! * f[j]!;
      }
      Atbx[i]! += f[i]! * s.screen.x;
      Atby[i]! += f[i]! * s.screen.y;
    }
  }

  const xCoeffs = solveLinearSystem(AtA, Atbx);
  // Rebuild AtA (it was modified in-place by Gaussian elimination)
  for (let i = 0; i < NUM_PARAMS; i++) {
    for (let j = 0; j < NUM_PARAMS; j++) {
      AtA[i]![j] = 0;
    }
  }
  for (const s of samples) {
    const f = featureRow(s);
    for (let i = 0; i < NUM_PARAMS; i++) {
      for (let j = 0; j < NUM_PARAMS; j++) {
        AtA[i]![j]! += f[i]! * f[j]!;
      }
    }
  }
  const yCoeffs = solveLinearSystem(AtA, Atby);

  if (!xCoeffs || !yCoeffs) return null;

  return { xCoeffs, yCoeffs };
}

export function applyGazeTransform(
  t: GazeTransform,
  gaze: Point2D,
  yaw: number,
  pitch: number,
): Point2D {
  const f = [gaze.x, gaze.y, yaw, pitch, 1];
  let sx = 0,
    sy = 0;
  for (let i = 0; i < NUM_PARAMS; i++) {
    sx += t.xCoeffs[i]! * f[i]!;
    sy += t.yCoeffs[i]! * f[i]!;
  }
  return { x: sx, y: sy };
}
