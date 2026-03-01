export interface Point2D {
  x: number;
  y: number;
}

export interface Point3D {
  x: number;
  y: number;
  z: number;
}

export interface EulerAngles {
  yaw: number;
  pitch: number;
  roll: number;
}

export interface TrackingResult {
  faceCenter?: Point2D;
  headPose?: EulerAngles;
  landmarks?: Point3D[];
  inferenceMs: number;
  timestamp: number;
}

export interface TrackerClientOptions {
  wasmPath?: string;
  modelPath?: string;
}

// Main → Worker
export type WorkerInMsg =
  | { type: "init"; config: { wasmPath: string; modelPath: string } }
  | { type: "detect"; frame: ImageBitmap; timestamp: number; id: number }
  | { type: "dispose" };

// Worker → Main
export type WorkerOutMsg =
  | { type: "ready" }
  | { type: "result"; id: number; data: TrackingResult }
  | { type: "error"; message: string };

export interface CameraOptions {
  width?: number;
  height?: number;
  facingMode?: "user" | "environment";
  inferenceWidth?: number;
  inferenceHeight?: number;
}

export interface FilterOptions {
  minCutoff?: number;
  beta?: number;
  dCutoff?: number;
}
