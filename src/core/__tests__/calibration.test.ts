import { describe, it, expect } from "vitest";
import {
  computeAffineTransform,
  applyTransform,
  type CalibrationSample,
} from "../calibration";

describe("computeAffineTransform", () => {
  it("returns null for fewer than 3 samples", () => {
    expect(computeAffineTransform([])).toBeNull();
    expect(
      computeAffineTransform([
        { gaze: { x: 0, y: 0 }, screen: { x: 0, y: 0 } },
        { gaze: { x: 1, y: 0 }, screen: { x: 1920, y: 0 } },
      ]),
    ).toBeNull();
  });

  it("computes identity-like transform for matching inputs", () => {
    const samples: CalibrationSample[] = [
      { gaze: { x: 0, y: 0 }, screen: { x: 0, y: 0 } },
      { gaze: { x: 1, y: 0 }, screen: { x: 1, y: 0 } },
      { gaze: { x: 0, y: 1 }, screen: { x: 0, y: 1 } },
    ];
    const t = computeAffineTransform(samples);
    expect(t).not.toBeNull();
    const p = applyTransform(t!, { x: 0.5, y: 0.5 });
    expect(p.x).toBeCloseTo(0.5, 5);
    expect(p.y).toBeCloseTo(0.5, 5);
  });

  it("maps gazeRatio to screen coordinates with 9-point calibration", () => {
    // Simulate: gaze(0..1) → screen(0..1920, 0..1080)
    const W = 1920,
      H = 1080;
    const samples: CalibrationSample[] = [];
    for (const gy of [0, 0.5, 1]) {
      for (const gx of [0, 0.5, 1]) {
        samples.push({
          gaze: { x: gx, y: gy },
          screen: { x: gx * W, y: gy * H },
        });
      }
    }
    const t = computeAffineTransform(samples)!;
    expect(t).not.toBeNull();

    // Check corners
    expect(applyTransform(t, { x: 0, y: 0 }).x).toBeCloseTo(0, 1);
    expect(applyTransform(t, { x: 0, y: 0 }).y).toBeCloseTo(0, 1);
    expect(applyTransform(t, { x: 1, y: 1 }).x).toBeCloseTo(W, 1);
    expect(applyTransform(t, { x: 1, y: 1 }).y).toBeCloseTo(H, 1);

    // Check center
    const center = applyTransform(t, { x: 0.5, y: 0.5 });
    expect(center.x).toBeCloseTo(W / 2, 1);
    expect(center.y).toBeCloseTo(H / 2, 1);
  });

  it("handles noisy samples via least-squares averaging", () => {
    const W = 1920,
      H = 1080;
    const samples: CalibrationSample[] = [
      { gaze: { x: 0.01, y: -0.02 }, screen: { x: 0, y: 0 } },
      { gaze: { x: 0.98, y: 0.03 }, screen: { x: W, y: 0 } },
      { gaze: { x: -0.01, y: 1.01 }, screen: { x: 0, y: H } },
      { gaze: { x: 1.02, y: 0.99 }, screen: { x: W, y: H } },
      { gaze: { x: 0.49, y: 0.51 }, screen: { x: W / 2, y: H / 2 } },
    ];
    const t = computeAffineTransform(samples)!;
    expect(t).not.toBeNull();

    // Even with noise, center should be reasonably accurate
    const center = applyTransform(t, { x: 0.5, y: 0.5 });
    expect(Math.abs(center.x - W / 2)).toBeLessThan(50);
    expect(Math.abs(center.y - H / 2)).toBeLessThan(50);
  });
});
