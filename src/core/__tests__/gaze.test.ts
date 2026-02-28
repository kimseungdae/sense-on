import { describe, it, expect } from "vitest";
import { computeGazeRatio } from "../gaze";
import type { Point3D } from "../types";

function makeLandmarks(
  overrides: Partial<Record<number, Partial<Point3D>>> = {},
): Point3D[] {
  const lm: Point3D[] = Array.from({ length: 478 }, () => ({
    x: 0.5,
    y: 0.5,
    z: 0,
  }));

  // Default eye corners (left eye)
  lm[33] = { x: 0.3, y: 0.5, z: 0 }; // LEFT_EYE_OUTER
  lm[133] = { x: 0.4, y: 0.5, z: 0 }; // LEFT_EYE_INNER
  lm[159] = { x: 0.35, y: 0.45, z: 0 }; // LEFT_EYE_TOP
  lm[145] = { x: 0.35, y: 0.55, z: 0 }; // LEFT_EYE_BOTTOM

  // Default eye corners (right eye)
  lm[263] = { x: 0.7, y: 0.5, z: 0 }; // RIGHT_EYE_OUTER
  lm[362] = { x: 0.6, y: 0.5, z: 0 }; // RIGHT_EYE_INNER
  lm[386] = { x: 0.65, y: 0.45, z: 0 }; // RIGHT_EYE_TOP
  lm[374] = { x: 0.65, y: 0.55, z: 0 }; // RIGHT_EYE_BOTTOM

  // Default iris centers (centered in eyes → gaze (0,0))
  lm[468] = { x: 0.35, y: 0.5, z: 0 }; // LEFT_IRIS_CENTER
  lm[473] = { x: 0.65, y: 0.5, z: 0 }; // RIGHT_IRIS_CENTER

  for (const [idx, vals] of Object.entries(overrides)) {
    lm[Number(idx)] = { ...lm[Number(idx)]!, ...vals } as Point3D;
  }
  return lm;
}

describe("computeGazeRatio", () => {
  it("returns (0, 0) for centered iris", () => {
    const result = computeGazeRatio(makeLandmarks());
    expect(result.x).toBeCloseTo(0, 1);
    expect(result.y).toBeCloseTo(0, 1);
  });

  it("returns positive x when looking right", () => {
    const lm = makeLandmarks({
      468: { x: 0.3, y: 0.5, z: 0 }, // left iris → outer corner
      473: { x: 0.7, y: 0.5, z: 0 }, // right iris → outer corner
    });
    const result = computeGazeRatio(lm);
    expect(result.x).toBeGreaterThan(0.5);
  });

  it("returns negative x when looking left", () => {
    const lm = makeLandmarks({
      468: { x: 0.4, y: 0.5, z: 0 }, // left iris → inner corner
      473: { x: 0.6, y: 0.5, z: 0 }, // right iris → inner corner
    });
    const result = computeGazeRatio(lm);
    expect(result.x).toBeLessThan(-0.5);
  });

  it("returns positive y when looking down", () => {
    const lm = makeLandmarks({
      468: { x: 0.35, y: 0.55, z: 0 }, // left iris → bottom
      473: { x: 0.65, y: 0.55, z: 0 }, // right iris → bottom
    });
    const result = computeGazeRatio(lm);
    expect(result.y).toBeGreaterThan(0.5);
  });

  it("returns negative y when looking up", () => {
    const lm = makeLandmarks({
      468: { x: 0.35, y: 0.45, z: 0 },
      473: { x: 0.65, y: 0.45, z: 0 },
    });
    const result = computeGazeRatio(lm);
    expect(result.y).toBeLessThan(-0.5);
  });

  it("returns (0, 0) for insufficient landmarks", () => {
    const result = computeGazeRatio([]);
    expect(result.x).toBe(0);
    expect(result.y).toBe(0);
  });

  it("handles zero-width eye gracefully", () => {
    const lm = makeLandmarks({
      33: { x: 0.35, y: 0.5, z: 0 },
      133: { x: 0.35, y: 0.5, z: 0 }, // same as outer → zero width
    });
    const result = computeGazeRatio(lm);
    expect(Number.isFinite(result.x)).toBe(true);
  });
});
