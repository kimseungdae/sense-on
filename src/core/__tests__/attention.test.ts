import { describe, it, expect } from "vitest";
import { computeEAR, computeAttention } from "../attention";
import type { TrackingResult } from "../types";
import type { Point3D } from "../types";

function makeLandmarks(
  overrides: Record<number, Partial<Point3D>> = {},
): Point3D[] {
  const lm: Point3D[] = Array.from({ length: 478 }, () => ({
    x: 0.5,
    y: 0.5,
    z: 0,
  }));
  // Default: eyes wide open (top-bottom > inner-outer * threshold)
  // Left eye
  lm[33] = { x: 0.35, y: 0.4, z: 0 }; // outer
  lm[133] = { x: 0.45, y: 0.4, z: 0 }; // inner
  lm[159] = { x: 0.4, y: 0.37, z: 0 }; // top
  lm[145] = { x: 0.4, y: 0.43, z: 0 }; // bottom
  // Right eye
  lm[263] = { x: 0.55, y: 0.4, z: 0 }; // outer
  lm[362] = { x: 0.65, y: 0.4, z: 0 }; // inner
  lm[386] = { x: 0.6, y: 0.37, z: 0 }; // top
  lm[374] = { x: 0.6, y: 0.43, z: 0 }; // bottom

  for (const [idx, val] of Object.entries(overrides)) {
    lm[Number(idx)] = { ...lm[Number(idx)]!, ...val };
  }
  return lm;
}

function makeResult(partial: Partial<TrackingResult> = {}): TrackingResult {
  return {
    faceCenter: { x: 0.5, y: 0.5 },
    headPose: { yaw: 0, pitch: 0, roll: 0 },
    landmarks: makeLandmarks(),
    inferenceMs: 10,
    timestamp: 1000,
    ...partial,
  };
}

describe("computeEAR", () => {
  it("returns ~0.6 for wide open eyes", () => {
    const ear = computeEAR(makeLandmarks());
    expect(ear).toBeGreaterThan(0.4);
  });

  it("returns low value for closed eyes", () => {
    const lm = makeLandmarks({
      159: { y: 0.401 }, // top very close to bottom
      145: { y: 0.399 },
      386: { y: 0.401 },
      374: { y: 0.399 },
    });
    const ear = computeEAR(lm);
    expect(ear).toBeLessThan(0.1);
  });

  it("returns 1 if landmarks count < 478", () => {
    expect(computeEAR([])).toBe(1);
  });
});

describe("computeAttention", () => {
  it("returns attentive when facing front with eyes open", () => {
    const result = computeAttention(makeResult());
    expect(result.state).toBe("attentive");
    expect(result.facePresent).toBe(true);
  });

  it("returns absent when no face detected", () => {
    const result = computeAttention(
      makeResult({ faceCenter: undefined, landmarks: undefined }),
    );
    expect(result.state).toBe("absent");
    expect(result.facePresent).toBe(false);
  });

  it("returns looking_away when yaw exceeds threshold", () => {
    const result = computeAttention(
      makeResult({
        headPose: { yaw: 30, pitch: 0, roll: 0 },
      }),
    );
    expect(result.state).toBe("looking_away");
  });

  it("returns looking_away when pitch exceeds threshold", () => {
    const result = computeAttention(
      makeResult({
        headPose: { yaw: 0, pitch: -25, roll: 0 },
      }),
    );
    expect(result.state).toBe("looking_away");
  });

  it("returns drowsy when eyes are closed", () => {
    const closedLandmarks = makeLandmarks({
      159: { y: 0.401 },
      145: { y: 0.399 },
      386: { y: 0.401 },
      374: { y: 0.399 },
    });
    const result = computeAttention(makeResult({ landmarks: closedLandmarks }));
    expect(result.state).toBe("drowsy");
    expect(result.eyeOpenness).toBeLessThan(0.2);
  });

  it("looking_away takes priority over drowsy", () => {
    const closedLandmarks = makeLandmarks({
      159: { y: 0.401 },
      145: { y: 0.399 },
      386: { y: 0.401 },
      374: { y: 0.399 },
    });
    const result = computeAttention(
      makeResult({
        headPose: { yaw: 30, pitch: 0, roll: 0 },
        landmarks: closedLandmarks,
      }),
    );
    expect(result.state).toBe("looking_away");
  });

  it("reports headYaw and headPitch values", () => {
    const result = computeAttention(
      makeResult({
        headPose: { yaw: 15, pitch: -10, roll: 5 },
      }),
    );
    expect(result.headYaw).toBe(15);
    expect(result.headPitch).toBe(-10);
  });
});
