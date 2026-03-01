import type { EyePatches, Point2D } from "./types";

export interface GazeTransform {
  readonly xCoeffs: readonly number[];
  readonly yCoeffs: readonly number[];
  readonly featureMean: readonly number[];
  readonly featureStd: readonly number[];
  readonly numFeatures: number;
}

export interface CalibrationSample {
  features: number[];
  screen: Point2D;
}

const EYE_PATCH_SIZE = 60; // 10x6 per eye

export function buildFeatureVector(
  eyePatches: EyePatches | undefined,
  headYaw: number,
  headPitch: number,
  faceCenter: Point2D | undefined,
): number[] {
  const features: number[] = [];

  if (eyePatches) {
    for (let i = 0; i < eyePatches.left.length; i++) {
      features.push(eyePatches.left[i]!);
    }
    for (let i = 0; i < eyePatches.right.length; i++) {
      features.push(eyePatches.right[i]!);
    }
  } else {
    for (let i = 0; i < EYE_PATCH_SIZE * 2; i++) features.push(0);
  }

  features.push(headYaw, headPitch);
  features.push(
    faceCenter ? faceCenter.x : 0.5,
    faceCenter ? faceCenter.y : 0.5,
  );

  return features;
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
  numFeatures: number,
  numParams: number,
): { AtA: number[][]; Atbx: number[]; Atby: number[] } {
  const AtA: number[][] = Array.from({ length: numParams }, () =>
    new Array(numParams).fill(0),
  );
  const Atbx = new Array<number>(numParams).fill(0);
  const Atby = new Array<number>(numParams).fill(0);

  for (let k = 0; k < rows.length; k++) {
    const f = rows[k]!;
    const s = samples[k]!;
    for (let i = 0; i < numParams; i++) {
      for (let j = 0; j < numParams; j++) {
        AtA[i]![j]! += f[i]! * f[j]!;
      }
      Atbx[i]! += f[i]! * s.screen.x;
      Atby[i]! += f[i]! * s.screen.y;
    }
  }

  // Ridge: add lambda to diagonal (skip bias at last index)
  for (let i = 0; i < numFeatures; i++) {
    AtA[i]![i]! += lambda;
  }

  return { AtA, Atbx, Atby };
}

// Ridge regression: (AᵀA + λI')β = Aᵀb with feature standardization
export function computeGazeTransform(
  samples: CalibrationSample[],
  lambda: number = 10.0,
): GazeTransform | null {
  const n = samples.length;
  if (n === 0) return null;

  const numFeatures = samples[0]!.features.length;
  const numParams = numFeatures + 1;

  if (n < Math.min(numParams, 20)) return null;

  const rawFeatures = samples.map((s) => s.features);

  // Compute mean and std per feature
  const mean = new Array<number>(numFeatures).fill(0);
  const std = new Array<number>(numFeatures).fill(0);

  for (const f of rawFeatures) {
    for (let i = 0; i < numFeatures; i++) mean[i]! += f[i]!;
  }
  for (let i = 0; i < numFeatures; i++) mean[i]! /= n;

  for (const f of rawFeatures) {
    for (let i = 0; i < numFeatures; i++) {
      std[i]! += (f[i]! - mean[i]!) ** 2;
    }
  }
  for (let i = 0; i < numFeatures; i++) {
    std[i] = Math.sqrt(std[i]! / n);
    if (std[i]! < 1e-10) std[i] = 1;
  }

  // Standardize and append bias
  const rows = rawFeatures.map((f) => {
    const s = f.map((v, i) => (v - mean[i]!) / std[i]!);
    s.push(1);
    return s;
  });

  // Solve for X coefficients
  const { AtA, Atbx } = buildAtA(rows, samples, lambda, numFeatures, numParams);
  const xCoeffs = solveLinearSystem(AtA, Atbx);

  // Rebuild AtA for Y (Gaussian elimination modifies in-place)
  const { AtA: AtA2, Atby } = buildAtA(
    rows,
    samples,
    lambda,
    numFeatures,
    numParams,
  );
  const yCoeffs = solveLinearSystem(AtA2, Atby);

  if (!xCoeffs || !yCoeffs) return null;

  return { xCoeffs, yCoeffs, featureMean: mean, featureStd: std, numFeatures };
}

export function applyGazeTransform(
  t: GazeTransform,
  features: number[],
): Point2D {
  const numParams = t.numFeatures + 1;
  const f: number[] = features.map(
    (v, i) => (v - t.featureMean[i]!) / t.featureStd[i]!,
  );
  f.push(1);

  let sx = 0,
    sy = 0;
  for (let i = 0; i < numParams; i++) {
    sx += t.xCoeffs[i]! * f[i]!;
    sy += t.yCoeffs[i]! * f[i]!;
  }
  return { x: sx, y: sy };
}
