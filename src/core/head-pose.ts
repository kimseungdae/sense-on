import type { EulerAngles } from "./types";

const RAD2DEG = 180 / Math.PI;

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function matrixToEuler(m: number[]): EulerAngles {
  // MediaPipe facialTransformationMatrixes: 4x4 column-major
  // R[row][col] = m[col * 4 + row]
  const r20 = m[2] ?? 0;
  const r21 = m[6] ?? 0;
  const r22 = m[10] ?? 1;
  const r10 = m[1] ?? 0;
  const r00 = m[0] ?? 1;

  // ZYX Tait-Bryan decomposition:
  // asin(-r20) → Y-axis rotation → yaw (head left/right)
  // atan2(r21, r22) → X-axis rotation → pitch (head up/down)
  // atan2(r10, r00) → Z-axis rotation → roll (head tilt)
  const yaw = Math.asin(-clamp(r20, -1, 1)) * RAD2DEG;
  const pitch = Math.atan2(r21, r22) * RAD2DEG;
  const roll = Math.atan2(r10, r00) * RAD2DEG;

  return { yaw, pitch, roll };
}
