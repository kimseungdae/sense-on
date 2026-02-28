import { computeGazeRatio } from "./gaze";
import { matrixToEuler } from "./head-pose";
import type {
  WorkerInMsg,
  WorkerOutMsg,
  TrackingResult,
  Point3D,
} from "./types";

let faceLandmarker: any = null;

async function init(wasmPath: string, modelPath: string) {
  const vision = await (self as any).FilesetResolver.forVisionTasks(wasmPath);
  faceLandmarker = await (self as any).FaceLandmarker.createFromOptions(
    vision,
    {
      baseOptions: {
        modelAssetPath: modelPath,
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      numFaces: 1,
      outputFacialTransformationMatrixes: true,
    },
  );
}

function detect(frame: ImageBitmap, timestamp: number, id: number) {
  if (!faceLandmarker) {
    reply({ type: "error", message: "Not initialized" });
    return;
  }

  const t0 = performance.now();
  const result = faceLandmarker.detectForVideo(frame, timestamp);
  const inferenceMs = performance.now() - t0;

  frame.close();

  if (!result.faceLandmarks || result.faceLandmarks.length === 0) {
    reply({
      type: "result",
      id,
      data: {
        gazeRatio: { x: 0, y: 0 },
        headPose: { yaw: 0, pitch: 0, roll: 0 },
        inferenceMs,
        timestamp,
      },
    });
    return;
  }

  const landmarks: Point3D[] = result.faceLandmarks[0];
  const gazeRatio = computeGazeRatio(landmarks);

  let headPose = { yaw: 0, pitch: 0, roll: 0 };
  if (result.facialTransformationMatrixes?.length > 0) {
    const matrix = result.facialTransformationMatrixes[0].data;
    headPose = matrixToEuler(Array.from(matrix));
  }

  const data: TrackingResult = {
    gazeRatio,
    headPose,
    inferenceMs,
    timestamp,
  };

  reply({ type: "result", id, data });
}

function reply(msg: WorkerOutMsg) {
  self.postMessage(msg);
}

self.onmessage = async (e: MessageEvent<WorkerInMsg>) => {
  const msg = e.data;

  try {
    switch (msg.type) {
      case "init":
        await init(msg.config.wasmPath, msg.config.modelPath);
        reply({ type: "ready" });
        break;
      case "detect":
        detect(msg.frame, msg.timestamp, msg.id);
        break;
      case "dispose":
        faceLandmarker?.close();
        faceLandmarker = null;
        break;
    }
  } catch (err) {
    reply({
      type: "error",
      message: err instanceof Error ? err.message : String(err),
    });
  }
};
