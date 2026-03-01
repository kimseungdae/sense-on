import { describe, it, expect } from "vitest";
import {
  computeGazeTransform,
  applyGazeTransform,
  buildFeatureVector,
  type CalibrationSample,
} from "../calibration";

function makeSample(
  features: number[],
  sx: number,
  sy: number,
): CalibrationSample {
  return { features, screen: { x: sx, y: sy } };
}

describe("computeGazeTransform", () => {
  it("returns null for too few samples", () => {
    expect(computeGazeTransform([])).toBeNull();
    // 6 features + 1 bias = 7 params, min(7, 20) = 7 required
    const few = Array.from({ length: 6 }, (_, i) =>
      makeSample([i * 0.1, i * 0.05, i * 0.1, i * 0.05, 0, 0.3], i * 320, 0),
    );
    expect(computeGazeTransform(few)).toBeNull();
  });

  it("maps features to screen with 9-point calibration", () => {
    const W = 1920,
      H = 1080;
    const samples: CalibrationSample[] = [
      makeSample([-0.25, -0.2, -0.25, -0.2, 0.01, 0.3], 0, 0),
      makeSample([0, -0.18, 0, -0.18, 0.0, 0.3], W / 2, 0),
      makeSample([0.25, -0.16, 0.25, -0.16, -0.01, 0.3], W, 0),
      makeSample([-0.22, 0, -0.22, 0, 0.01, 0.31], 0, H / 2),
      makeSample([0, 0, 0, 0, 0.0, 0.3], W / 2, H / 2),
      makeSample([0.22, 0, 0.22, 0, -0.01, 0.29], W, H / 2),
      makeSample([-0.25, 0.2, -0.25, 0.2, 0.01, 0.3], 0, H),
      makeSample([0, 0.18, 0, 0.18, 0.0, 0.3], W / 2, H),
      makeSample([0.25, 0.16, 0.25, 0.16, -0.01, 0.3], W, H),
    ];
    const t = computeGazeTransform(samples)!;
    expect(t).not.toBeNull();
    expect(t.xCoeffs).toHaveLength(7);
    expect(t.yCoeffs).toHaveLength(7);
    expect(t.featureMean).toHaveLength(6);
    expect(t.featureStd).toHaveLength(6);
    expect(t.numFeatures).toBe(6);

    const center = applyGazeTransform(t, [0, 0, 0, 0, 0.0, 0.3]);
    expect(Math.abs(center.x - W / 2)).toBeLessThan(100);
    expect(Math.abs(center.y - H / 2)).toBeLessThan(100);
  });

  it("ridge suppresses constant-feature coefficients", () => {
    const W = 1920,
      H = 1080;
    const samples: CalibrationSample[] = [
      makeSample([-0.3, -0.2, -0.3, -0.2, 0.0, 0.3], 0, 0),
      makeSample([0, -0.2, 0, -0.2, 0.0, 0.3], W / 2, 0),
      makeSample([0.3, -0.2, 0.3, -0.2, 0.0, 0.3], W, 0),
      makeSample([-0.3, 0, -0.3, 0, 0.0, 0.3], 0, H / 2),
      makeSample([0, 0, 0, 0, 0.0, 0.3], W / 2, H / 2),
      makeSample([0.3, 0, 0.3, 0, 0.0, 0.3], W, H / 2),
      makeSample([-0.3, 0.2, -0.3, 0.2, 0.0, 0.3], 0, H),
      makeSample([0, 0.2, 0, 0.2, 0.0, 0.3], W / 2, H),
      makeSample([0.3, 0.2, 0.3, 0.2, 0.0, 0.3], W, H),
    ];
    const t = computeGazeTransform(samples)!;
    expect(t).not.toBeNull();

    // Fixed head — should predict center
    const centerFixed = applyGazeTransform(t, [0, 0, 0, 0, 0.0, 0.3]);
    expect(Math.abs(centerFixed.x - W / 2)).toBeLessThan(50);
    expect(Math.abs(centerFixed.y - H / 2)).toBeLessThan(50);

    // Head rotated — Ridge should suppress headYaw coefficient since it was constant
    const centerRotated = applyGazeTransform(t, [0, 0, 0, 0, -0.2, 0.3]);
    expect(Math.abs(centerRotated.x - W / 2)).toBeLessThan(200);
    expect(Math.abs(centerRotated.y - H / 2)).toBeLessThan(200);
  });

  it("handles noisy samples via ridge regression (legacy 6-feature)", () => {
    const W = 1920,
      H = 1080;
    const samples: CalibrationSample[] = [
      makeSample([-0.28, -0.19, -0.32, -0.21, 0.02, 0.31], 0, 0),
      makeSample([0.27, -0.17, 0.23, -0.19, -0.01, 0.29], W, 0),
      makeSample([-0.26, 0.18, -0.3, 0.22, 0.01, 0.31], 0, H),
      makeSample([0.28, 0.21, 0.24, 0.19, -0.02, 0.29], W, H),
      makeSample([0.01, -0.01, -0.01, 0.01, 0.0, 0.3], W / 2, H / 2),
      makeSample([-0.14, -0.09, -0.16, -0.11, 0.01, 0.3], W / 4, H / 4),
      makeSample(
        [0.14, 0.11, 0.12, 0.09, -0.01, 0.3],
        (W * 3) / 4,
        (H * 3) / 4,
      ),
    ];
    const t = computeGazeTransform(samples)!;
    expect(t).not.toBeNull();

    const center = applyGazeTransform(t, [0, 0, 0, 0, 0.0, 0.3]);
    expect(Math.abs(center.x - W / 2)).toBeLessThan(200);
    expect(Math.abs(center.y - H / 2)).toBeLessThan(200);
  });
});

describe("buildFeatureVector", () => {
  it("returns 124-dim vector with eyePatches", () => {
    const patches = {
      left: new Array(60).fill(0.5),
      right: new Array(60).fill(0.3),
    };
    const v = buildFeatureVector(patches, 0.1, -0.05, { x: 0.5, y: 0.4 });
    expect(v).toHaveLength(124);
    expect(v[0]).toBe(0.5);
    expect(v[60]).toBe(0.3);
    expect(v[120]).toBe(0.1);
    expect(v[121]).toBe(-0.05);
    expect(v[122]).toBe(0.5);
    expect(v[123]).toBe(0.4);
  });

  it("returns 124-dim vector with zero padding when eyePatches undefined", () => {
    const v = buildFeatureVector(undefined, 0.1, -0.05, { x: 0.5, y: 0.4 });
    expect(v).toHaveLength(124);
    for (let i = 0; i < 120; i++) {
      expect(v[i]).toBe(0);
    }
    expect(v[120]).toBe(0.1);
    expect(v[121]).toBe(-0.05);
    expect(v[122]).toBe(0.5);
    expect(v[123]).toBe(0.4);
  });

  it("uses default faceCenter when undefined", () => {
    const v = buildFeatureVector(undefined, 0, 0, undefined);
    expect(v).toHaveLength(124);
    expect(v[122]).toBe(0.5);
    expect(v[123]).toBe(0.5);
  });
});
