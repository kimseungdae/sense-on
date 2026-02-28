import type { GazeFeatures, Point2D } from "./types";

export interface GazeTransform {
  readonly xCoeffs: readonly number[];
  readonly yCoeffs: readonly number[];
  readonly featureMean: readonly number[];
  readonly featureStd: readonly number[];
}

export interface CalibrationSample {
  features: GazeFeatures;
  screen: Point2D;
}

const NUM_FEATURES = 6; // lGx, lGy, rGx, rGy, fcX, fcY
const NUM_PARAMS = NUM_FEATURES + 1; // + bias

function toFeatureVector(gf: GazeFeatures): number[] {
  return [
    gf.leftGaze.x,
    gf.leftGaze.y,
    gf.rightGaze.x,
    gf.rightGaze.y,
    gf.faceCenter.x,
    gf.faceCenter.y,
  ];
}

// NxN Gaussian elimination with partial pivoting
function solveLinearSystem(A: number[][], b: number[]): number[] | null {
  const n = A.length;
  const aug = A.map((row, i) => [...row, b[i]!]);

  for (let col = 0; col < n; col++) {
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(aug[row]![col]!) > Math.abs(aug[maxRow]![col]!)) {
        maxRow = row;
      }
    }
    [aug[col], aug[maxRow]] = [aug[maxRow]!, aug[col]!];

    if (Math.abs(aug[col]![col]!) < 1e-12) return null;

    for (let row = col + 1; row < n; row++) {
      const factor = aug[row]![col]! / aug[col]![col]!;
      for (let j = col; j <= n; j++) {
        aug[row]![j] = aug[row]![j]! - factor * aug[col]![j]!;
      }
    }
  }

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

function buildAtA(
  rows: number[][],
  samples: CalibrationSample[],
  lambda: number,
): { AtA: number[][]; Atbx: number[]; Atby: number[] } {
  const AtA: number[][] = Array.from({ length: NUM_PARAMS }, () =>
    new Array(NUM_PARAMS).fill(0),
  );
  const Atbx = new Array<number>(NUM_PARAMS).fill(0);
  const Atby = new Array<number>(NUM_PARAMS).fill(0);

  for (let k = 0; k < rows.length; k++) {
    const f = rows[k]!;
    const s = samples[k]!;
    for (let i = 0; i < NUM_PARAMS; i++) {
      for (let j = 0; j < NUM_PARAMS; j++) {
        AtA[i]![j]! += f[i]! * f[j]!;
      }
      Atbx[i]! += f[i]! * s.screen.x;
      Atby[i]! += f[i]! * s.screen.y;
    }
  }

  // Ridge: add lambda to diagonal (skip bias at last index)
  for (let i = 0; i < NUM_FEATURES; i++) {
    AtA[i]![i]! += lambda;
  }

  return { AtA, Atbx, Atby };
}

// Ridge regression: (AᵀA + λI')β = Aᵀb with feature standardization
export function computeGazeTransform(
  samples: CalibrationSample[],
  lambda: number = 1.0,
): GazeTransform | null {
  const n = samples.length;
  if (n < NUM_PARAMS) return null;

  const rawFeatures = samples.map((s) => toFeatureVector(s.features));

  // Compute mean and std per feature
  const mean = new Array<number>(NUM_FEATURES).fill(0);
  const std = new Array<number>(NUM_FEATURES).fill(0);

  for (const f of rawFeatures) {
    for (let i = 0; i < NUM_FEATURES; i++) mean[i]! += f[i]!;
  }
  for (let i = 0; i < NUM_FEATURES; i++) mean[i]! /= n;

  for (const f of rawFeatures) {
    for (let i = 0; i < NUM_FEATURES; i++) {
      std[i]! += (f[i]! - mean[i]!) ** 2;
    }
  }
  for (let i = 0; i < NUM_FEATURES; i++) {
    std[i] = Math.sqrt(std[i]! / n);
    if (std[i]! < 1e-10) std[i] = 1;
  }

  // Standardize and append bias
  const rows = rawFeatures.map((f) => {
    const s = f.map((v, i) => (v! - mean[i]!) / std[i]!);
    s.push(1);
    return s;
  });

  // Solve for X coefficients
  const { AtA, Atbx } = buildAtA(rows, samples, lambda);
  const xCoeffs = solveLinearSystem(AtA, Atbx);

  // Rebuild AtA for Y (Gaussian elimination modifies in-place)
  const { AtA: AtA2, Atby } = buildAtA(rows, samples, lambda);
  const yCoeffs = solveLinearSystem(AtA2, Atby);

  if (!xCoeffs || !yCoeffs) return null;

  return { xCoeffs, yCoeffs, featureMean: mean, featureStd: std };
}

export function applyGazeTransform(
  t: GazeTransform,
  gf: GazeFeatures,
): Point2D {
  const raw = toFeatureVector(gf);
  const f: number[] = raw.map(
    (v, i) => (v - t.featureMean[i]!) / t.featureStd[i]!,
  );
  f.push(1);

  let sx = 0,
    sy = 0;
  for (let i = 0; i < NUM_PARAMS; i++) {
    sx += t.xCoeffs[i]! * f[i]!;
    sy += t.yCoeffs[i]! * f[i]!;
  }
  return { x: sx, y: sy };
}
