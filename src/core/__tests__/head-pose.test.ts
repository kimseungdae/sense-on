import { describe, it, expect } from "vitest";
import { matrixToEuler } from "../head-pose";

function identity4x4(): number[] {
  // 4x4 identity in column-major order
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

function rotateY(deg: number): number[] {
  const rad = (deg * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  // Column-major rotation around Y axis
  return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1];
}

function rotateX(deg: number): number[] {
  const rad = (deg * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  // Column-major rotation around X axis
  return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1];
}

function rotateZ(deg: number): number[] {
  const rad = (deg * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  // Column-major rotation around Z axis
  return [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

describe("matrixToEuler", () => {
  it("returns (0, 0, 0) for identity matrix", () => {
    const result = matrixToEuler(identity4x4());
    expect(result.yaw).toBeCloseTo(0, 5);
    expect(result.pitch).toBeCloseTo(0, 5);
    expect(result.roll).toBeCloseTo(0, 5);
  });

  it("detects pitch from X rotation (head up/down)", () => {
    const result = matrixToEuler(rotateX(30));
    expect(Math.abs(result.pitch)).toBeCloseTo(30, 0);
  });

  it("detects yaw from Y rotation (head left/right)", () => {
    const result = matrixToEuler(rotateY(30));
    expect(Math.abs(result.yaw)).toBeCloseTo(30, 0);
  });

  it("detects roll from Z rotation", () => {
    const result = matrixToEuler(rotateZ(45));
    expect(Math.abs(result.roll)).toBeCloseTo(45, 0);
  });

  it("returns finite values for edge case matrices", () => {
    // All zeros except diagonal
    const m = new Array(16).fill(0);
    m[0] = 1;
    m[5] = 1;
    m[10] = 1;
    m[15] = 1;
    const result = matrixToEuler(m);
    expect(Number.isFinite(result.yaw)).toBe(true);
    expect(Number.isFinite(result.pitch)).toBe(true);
    expect(Number.isFinite(result.roll)).toBe(true);
  });
});
