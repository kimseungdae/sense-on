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
  fcX: number,
  fcY: number,
  sx: number,
  sy: number,
): CalibrationSample {
  return {
    features: {
      leftGaze: { x: lGx, y: lGy },
      rightGaze: { x: rGx, y: rGy },
      faceCenter: { x: fcX, y: fcY },
      ipd: 0.1,
    },
    screen: { x: sx, y: sy },
  };
}

function makeFeatures(
  lGx: number,
  lGy: number,
  rGx: number,
  rGy: number,
  fcX: number,
  fcY: number,
): GazeFeatures {
  return {
    leftGaze: { x: lGx, y: lGy },
    rightGaze: { x: rGx, y: rGy },
    faceCenter: { x: fcX, y: fcY },
    ipd: 0.1,
  };
}

describe("computeGazeTransform", () => {
  it("returns null for fewer than 7 samples", () => {
    expect(computeGazeTransform([])).toBeNull();
    expect(
      computeGazeTransform([
        makeSample(-1.5, -0.5, 1.5, -0.5, 0.3, 0.3, 0, 0),
        makeSample(-1.5, -0.5, 1.5, -0.5, 0.5, 0.3, 960, 0),
        makeSample(-1.5, -0.5, 1.5, -0.5, 0.7, 0.3, 1920, 0),
        makeSample(-1.5, 0, 1.5, 0, 0.3, 0.5, 0, 540),
        makeSample(-1.5, 0, 1.5, 0, 0.5, 0.5, 960, 540),
        makeSample(-1.5, 0, 1.5, 0, 0.7, 0.5, 1920, 540),
      ]),
    ).toBeNull();
  });

  it("maps features to screen with 9-point calibration", () => {
    const W = 1920,
      H = 1080;
    const samples: CalibrationSample[] = [
      makeSample(-1.6, -0.6, 1.4, -0.6, 0.3, 0.3, 0, 0),
      makeSample(-1.5, -0.55, 1.5, -0.55, 0.5, 0.3, W / 2, 0),
      makeSample(-1.4, -0.5, 1.6, -0.5, 0.7, 0.3, W, 0),
      makeSample(-1.55, -0.1, 1.45, -0.1, 0.3, 0.5, 0, H / 2),
      makeSample(-1.5, 0, 1.5, 0, 0.5, 0.5, W / 2, H / 2),
      makeSample(-1.45, 0.1, 1.55, 0.1, 0.7, 0.5, W, H / 2),
      makeSample(-1.6, 0.5, 1.4, 0.5, 0.3, 0.7, 0, H),
      makeSample(-1.5, 0.55, 1.5, 0.55, 0.5, 0.7, W / 2, H),
      makeSample(-1.4, 0.6, 1.6, 0.6, 0.7, 0.7, W, H),
    ];
    const t = computeGazeTransform(samples)!;
    expect(t).not.toBeNull();
    expect(t.xCoeffs).toHaveLength(7);
    expect(t.yCoeffs).toHaveLength(7);
    expect(t.featureMean).toHaveLength(6);
    expect(t.featureStd).toHaveLength(6);

    const center = applyGazeTransform(
      t,
      makeFeatures(-1.5, 0, 1.5, 0, 0.5, 0.5),
    );
    expect(Math.abs(center.x - W / 2)).toBeLessThan(100);
    expect(Math.abs(center.y - H / 2)).toBeLessThan(100);
  });

  it("faceCenter captures head translation for screen prediction", () => {
    const W = 1920,
      H = 1080;
    // Gaze vectors CONSTANT — only faceCenter varies (pure head translation)
    const samples: CalibrationSample[] = [
      makeSample(-1.5, 0, 1.5, 0, 0.3, 0.3, 0, 0),
      makeSample(-1.5, 0, 1.5, 0, 0.5, 0.3, W / 2, 0),
      makeSample(-1.5, 0, 1.5, 0, 0.7, 0.3, W, 0),
      makeSample(-1.5, 0, 1.5, 0, 0.3, 0.5, 0, H / 2),
      makeSample(-1.5, 0, 1.5, 0, 0.5, 0.5, W / 2, H / 2),
      makeSample(-1.5, 0, 1.5, 0, 0.7, 0.5, W, H / 2),
      makeSample(-1.5, 0, 1.5, 0, 0.3, 0.7, 0, H),
      makeSample(-1.5, 0, 1.5, 0, 0.5, 0.7, W / 2, H),
      makeSample(-1.5, 0, 1.5, 0, 0.7, 0.7, W, H),
    ];
    const t = computeGazeTransform(samples)!;
    expect(t).not.toBeNull();

    const center = applyGazeTransform(
      t,
      makeFeatures(-1.5, 0, 1.5, 0, 0.5, 0.5),
    );
    expect(Math.abs(center.x - W / 2)).toBeLessThan(50);
    expect(Math.abs(center.y - H / 2)).toBeLessThan(50);

    const left = applyGazeTransform(t, makeFeatures(-1.5, 0, 1.5, 0, 0.3, 0.5));
    expect(left.x).toBeLessThan(W / 4);
  });

  it("handles noisy samples via ridge regression", () => {
    const W = 1920,
      H = 1080;
    const samples: CalibrationSample[] = [
      makeSample(-1.62, -0.58, 1.38, -0.62, 0.31, 0.29, 0, 0),
      makeSample(-1.38, -0.52, 1.62, -0.48, 0.69, 0.31, W, 0),
      makeSample(-1.58, 0.48, 1.42, 0.52, 0.29, 0.71, 0, H),
      makeSample(-1.42, 0.52, 1.58, 0.48, 0.71, 0.69, W, H),
      makeSample(-1.51, -0.01, 1.49, 0.01, 0.51, 0.49, W / 2, H / 2),
      makeSample(-1.56, -0.28, 1.44, -0.32, 0.4, 0.38, W / 4, H / 4),
      makeSample(-1.44, 0.28, 1.56, 0.32, 0.6, 0.62, (W * 3) / 4, (H * 3) / 4),
    ];
    const t = computeGazeTransform(samples)!;
    expect(t).not.toBeNull();

    const center = applyGazeTransform(
      t,
      makeFeatures(-1.5, 0, 1.5, 0, 0.5, 0.5),
    );
    expect(Math.abs(center.x - W / 2)).toBeLessThan(200);
    expect(Math.abs(center.y - H / 2)).toBeLessThan(200);
  });
});
