export type {
  Point2D,
  Point3D,
  EulerAngles,
  GazeFeatures,
  TrackingResult,
  TrackerClientOptions,
  CameraOptions,
  FilterOptions,
} from "./types";

export { computeGazeRatio, computeGazeFeatures } from "./gaze";
export { matrixToEuler } from "./head-pose";
export { createOneEuroFilter, createPointFilter } from "./filter";
export type { OneEuroFilter, PointFilter } from "./filter";
export { createTrackerClient } from "./tracker-client";
export type { TrackerClient } from "./tracker-client";
export { createCameraStream } from "./camera";
export type { CameraStream } from "./camera";
