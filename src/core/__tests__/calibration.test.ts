import { describe, it, expect } from "vitest";
import {
  computeGazeTransform,
  applyGazeTransform,
  type CalibrationSample,
} from "../calibration";
import type { GazeFeatures } from "../types";

function makeSample(
  lGx: number,
  lGy: number,
  rGx: number,
  rGy: number,
  headYaw: number,
  headPitch: number,
  sx: number,
  sy: number,
): CalibrationSample {
  return {
    features: {
      leftGaze: { x: lGx, y: lGy },
      rightGaze: { x: rGx, y: rGy },
      headYaw,
      headPitch,
    },
    screen: { x: sx, y: sy },
  };
}

function makeFeatures(
  lGx: number,
  lGy: number,
  rGx: number,
  rGy: number,
  headYaw: number,
  headPitch: number,
): GazeFeatures {
  return {
    leftGaze: { x: lGx, y: lGy },
    rightGaze: { x: rGx, y: rGy },
    headYaw,
    headPitch,
  };
}

describe("computeGazeTransform", () => {
  it("returns null for fewer than 7 samples", () => {
    expect(computeGazeTransform([])).toBeNull();
    expect(
      computeGazeTransform([
        makeSample(-0.2, -0.15, -0.2, -0.15, 0.0, 0.3, 0, 0),
        makeSample(0, -0.15, 0, -0.15, 0.0, 0.3, 960, 0),
        makeSample(0.2, -0.15, 0.2, -0.15, 0.0, 0.3, 1920, 0),
        makeSample(-0.2, 0, -0.2, 0, 0.0, 0.3, 0, 540),
        makeSample(0, 0, 0, 0, 0.0, 0.3, 960, 540),
        makeSample(0.2, 0, 0.2, 0, 0.0, 0.3, 1920, 540),
      ]),
    ).toBeNull();
  });

  it("maps eye-in-head gaze to screen with 9-point calibration", () => {
    const W = 1920,
      H = 1080;
    // Eye gaze varies across screen, headYaw/headPitch ~constant (fixed head)
    const samples: CalibrationSample[] = [
      makeSample(-0.25, -0.2, -0.25, -0.2, 0.01, 0.3, 0, 0),
      makeSample(0, -0.18, 0, -0.18, 0.0, 0.3, W / 2, 0),
      makeSample(0.25, -0.16, 0.25, -0.16, -0.01, 0.3, W, 0),
      makeSample(-0.22, 0, -0.22, 0, 0.01, 0.31, 0, H / 2),
      makeSample(0, 0, 0, 0, 0.0, 0.3, W / 2, H / 2),
      makeSample(0.22, 0, 0.22, 0, -0.01, 0.29, W, H / 2),
      makeSample(-0.25, 0.2, -0.25, 0.2, 0.01, 0.3, 0, H),
      makeSample(0, 0.18, 0, 0.18, 0.0, 0.3, W / 2, H),
      makeSample(0.25, 0.16, 0.25, 0.16, -0.01, 0.3, W, H),
    ];
    const t = computeGazeTransform(samples)!;
    expect(t).not.toBeNull();
    expect(t.xCoeffs).toHaveLength(7);
    expect(t.yCoeffs).toHaveLength(7);
    expect(t.featureMean).toHaveLength(6);
    expect(t.featureStd).toHaveLength(6);

    const center = applyGazeTransform(t, makeFeatures(0, 0, 0, 0, 0.0, 0.3));
    expect(Math.abs(center.x - W / 2)).toBeLessThan(100);
    expect(Math.abs(center.y - H / 2)).toBeLessThan(100);
  });

  it("head-invariant: same eye gaze predicts same position despite head movement", () => {
    const W = 1920,
      H = 1080;
    // Calibrate with fixed head (headYaw/headPitch constant)
    const samples: CalibrationSample[] = [
      makeSample(-0.3, -0.2, -0.3, -0.2, 0.0, 0.3, 0, 0),
      makeSample(0, -0.2, 0, -0.2, 0.0, 0.3, W / 2, 0),
      makeSample(0.3, -0.2, 0.3, -0.2, 0.0, 0.3, W, 0),
      makeSample(-0.3, 0, -0.3, 0, 0.0, 0.3, 0, H / 2),
      makeSample(0, 0, 0, 0, 0.0, 0.3, W / 2, H / 2),
      makeSample(0.3, 0, 0.3, 0, 0.0, 0.3, W, H / 2),
      makeSample(-0.3, 0.2, -0.3, 0.2, 0.0, 0.3, 0, H),
      makeSample(0, 0.2, 0, 0.2, 0.0, 0.3, W / 2, H),
      makeSample(0.3, 0.2, 0.3, 0.2, 0.0, 0.3, W, H),
    ];
    const t = computeGazeTransform(samples)!;
    expect(t).not.toBeNull();

    // Same eye gaze (center), fixed head
    const centerFixed = applyGazeTransform(
      t,
      makeFeatures(0, 0, 0, 0, 0.0, 0.3),
    );
    expect(Math.abs(centerFixed.x - W / 2)).toBeLessThan(50);
    expect(Math.abs(centerFixed.y - H / 2)).toBeLessThan(50);

    // Same eye gaze (center), but head rotated left (headYaw = -0.2)
    const centerHeadLeft = applyGazeTransform(
      t,
      makeFeatures(0, 0, 0, 0, -0.2, 0.3),
    );
    // Should still predict near center because Ridge suppressed headYaw coefficient
    expect(Math.abs(centerHeadLeft.x - W / 2)).toBeLessThan(200);
    expect(Math.abs(centerHeadLeft.y - H / 2)).toBeLessThan(200);
  });

  it("handles noisy samples via ridge regression", () => {
    const W = 1920,
      H = 1080;
    const samples: CalibrationSample[] = [
      makeSample(-0.28, -0.19, -0.32, -0.21, 0.02, 0.31, 0, 0),
      makeSample(0.27, -0.17, 0.23, -0.19, -0.01, 0.29, W, 0),
      makeSample(-0.26, 0.18, -0.3, 0.22, 0.01, 0.31, 0, H),
      makeSample(0.28, 0.21, 0.24, 0.19, -0.02, 0.29, W, H),
      makeSample(0.01, -0.01, -0.01, 0.01, 0.0, 0.3, W / 2, H / 2),
      makeSample(-0.14, -0.09, -0.16, -0.11, 0.01, 0.3, W / 4, H / 4),
      makeSample(0.14, 0.11, 0.12, 0.09, -0.01, 0.3, (W * 3) / 4, (H * 3) / 4),
    ];
    const t = computeGazeTransform(samples)!;
    expect(t).not.toBeNull();

    const center = applyGazeTransform(t, makeFeatures(0, 0, 0, 0, 0.0, 0.3));
    expect(Math.abs(center.x - W / 2)).toBeLessThan(200);
    expect(Math.abs(center.y - H / 2)).toBeLessThan(200);
  });
});
