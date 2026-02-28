import { describe, it, expect } from "vitest";
import {
  computeGazeTransform,
  applyGazeTransform,
  type CalibrationSample,
} from "../calibration";

function makeSample(
  gx: number,
  gy: number,
  yaw: number,
  pitch: number,
  sx: number,
  sy: number,
): CalibrationSample {
  return { gaze: { x: gx, y: gy }, yaw, pitch, screen: { x: sx, y: sy } };
}

describe("computeGazeTransform", () => {
  it("returns null for fewer than 5 samples", () => {
    expect(computeGazeTransform([])).toBeNull();
    expect(
      computeGazeTransform([
        makeSample(0, 0, 0, 0, 0, 0),
        makeSample(1, 0, 10, 0, 1920, 0),
        makeSample(0, 1, 0, 10, 0, 1080),
        makeSample(1, 1, 10, 10, 1920, 1080),
      ]),
    ).toBeNull();
  });

  it("maps gaze+headPose to screen with 9-point calibration", () => {
    const W = 1920,
      H = 1080;
    // Features must be independently varying (not perfectly collinear)
    const samples: CalibrationSample[] = [
      makeSample(0.35, 0.4, -12, -8, 0, 0),
      makeSample(0.5, 0.38, 0, -9, W / 2, 0),
      makeSample(0.65, 0.42, 13, -7, W, 0),
      makeSample(0.33, 0.5, -14, 1, 0, H / 2),
      makeSample(0.5, 0.5, 0, 0, W / 2, H / 2),
      makeSample(0.67, 0.5, 14, -1, W, H / 2),
      makeSample(0.36, 0.6, -11, 8, 0, H),
      makeSample(0.49, 0.62, 1, 9, W / 2, H),
      makeSample(0.64, 0.58, 12, 7, W, H),
    ];
    const t = computeGazeTransform(samples)!;
    expect(t).not.toBeNull();
    expect(t.xCoeffs).toHaveLength(5);
    expect(t.yCoeffs).toHaveLength(5);

    // Predict center — should be reasonably close
    const center = applyGazeTransform(t, { x: 0.5, y: 0.5 }, 0, 0);
    expect(Math.abs(center.x - W / 2)).toBeLessThan(100);
    expect(Math.abs(center.y - H / 2)).toBeLessThan(100);
  });

  it("headPose improves prediction beyond gaze-only", () => {
    const W = 1920,
      H = 1080;
    // gazeRatio has slight natural variation, headPose is main signal
    const samples: CalibrationSample[] = [
      makeSample(0.45, 0.47, -15, -10, 0, 0),
      makeSample(0.5, 0.48, 0, -10, W / 2, 0),
      makeSample(0.55, 0.47, 15, -10, W, 0),
      makeSample(0.46, 0.5, -15, 0, 0, H / 2),
      makeSample(0.5, 0.5, 0, 0, W / 2, H / 2),
      makeSample(0.54, 0.5, 15, 0, W, H / 2),
      makeSample(0.45, 0.53, -15, 10, 0, H),
      makeSample(0.5, 0.52, 0, 10, W / 2, H),
      makeSample(0.55, 0.53, 15, 10, W, H),
    ];
    const t = computeGazeTransform(samples)!;
    expect(t).not.toBeNull();

    // Head yaw should be a strong predictor of screen X
    const left = applyGazeTransform(t, { x: 0.46, y: 0.5 }, -15, 0);
    const right = applyGazeTransform(t, { x: 0.54, y: 0.5 }, 15, 0);
    expect(left.x).toBeLessThan(W / 4);
    expect(right.x).toBeGreaterThan((W * 3) / 4);
  });

  it("handles noisy samples via least-squares", () => {
    const W = 1920,
      H = 1080;
    const samples: CalibrationSample[] = [
      makeSample(0.36, 0.41, -13.5, -9.2, 0, 0),
      makeSample(0.64, 0.39, 12.8, -8.5, W, 0),
      makeSample(0.34, 0.61, -14.2, 9.8, 0, H),
      makeSample(0.66, 0.59, 13.5, 8.2, W, H),
      makeSample(0.5, 0.51, 0.5, -0.3, W / 2, H / 2),
      makeSample(0.42, 0.45, -7.2, -4.8, W / 4, H / 4),
      makeSample(0.58, 0.55, 7.8, 5.2, (W * 3) / 4, (H * 3) / 4),
    ];
    const t = computeGazeTransform(samples)!;
    expect(t).not.toBeNull();

    const center = applyGazeTransform(t, { x: 0.5, y: 0.5 }, 0, 0);
    expect(Math.abs(center.x - W / 2)).toBeLessThan(150);
    expect(Math.abs(center.y - H / 2)).toBeLessThan(150);
  });
});
