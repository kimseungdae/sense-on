import type { Point3D, TrackingResult } from "./types";

export type AttentionState = "attentive" | "looking_away" | "drowsy" | "absent";

export interface AttentionResult {
  state: AttentionState;
  headYaw: number;
  headPitch: number;
  eyeOpenness: number;
  facePresent: boolean;
}

const YAW_THRESHOLD = 25;
const PITCH_THRESHOLD = 20;
const EAR_CLOSED = 0.2;

const LEFT_EYE_TOP = 159;
const LEFT_EYE_BOTTOM = 145;
const LEFT_EYE_INNER = 133;
const LEFT_EYE_OUTER = 33;
const RIGHT_EYE_TOP = 386;
const RIGHT_EYE_BOTTOM = 374;
const RIGHT_EYE_INNER = 362;
const RIGHT_EYE_OUTER = 263;

function dist(a: Point3D, b: Point3D): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function computeEAR(landmarks: Point3D[]): number {
  if (landmarks.length < 478) return 1;

  const lTop = landmarks[LEFT_EYE_TOP]!;
  const lBot = landmarks[LEFT_EYE_BOTTOM]!;
  const lIn = landmarks[LEFT_EYE_INNER]!;
  const lOut = landmarks[LEFT_EYE_OUTER]!;
  const lWidth = dist(lIn, lOut);
  const leftEAR = lWidth > 0.001 ? dist(lTop, lBot) / lWidth : 1;

  const rTop = landmarks[RIGHT_EYE_TOP]!;
  const rBot = landmarks[RIGHT_EYE_BOTTOM]!;
  const rIn = landmarks[RIGHT_EYE_INNER]!;
  const rOut = landmarks[RIGHT_EYE_OUTER]!;
  const rWidth = dist(rIn, rOut);
  const rightEAR = rWidth > 0.001 ? dist(rTop, rBot) / rWidth : 1;

  return (leftEAR + rightEAR) / 2;
}

export function computeAttention(result: TrackingResult): AttentionResult {
  const facePresent = !!result.faceCenter && !!result.landmarks?.length;

  if (!facePresent) {
    return {
      state: "absent",
      headYaw: 0,
      headPitch: 0,
      eyeOpenness: 0,
      facePresent: false,
    };
  }

  const yaw = result.headPose?.yaw ?? 0;
  const pitch = result.headPose?.pitch ?? 0;
  const ear = result.landmarks ? computeEAR(result.landmarks) : 1;

  const lookingAway =
    Math.abs(yaw) > YAW_THRESHOLD || Math.abs(pitch) > PITCH_THRESHOLD;

  let state: AttentionState;
  if (lookingAway) {
    state = "looking_away";
  } else if (ear < EAR_CLOSED) {
    state = "drowsy";
  } else {
    state = "attentive";
  }

  return {
    state,
    headYaw: yaw,
    headPitch: pitch,
    eyeOpenness: ear,
    facePresent: true,
  };
}
