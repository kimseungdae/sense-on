import type { CameraOptions } from "./types";

export interface CameraStream {
  start(): Promise<void>;
  stop(): void;
  getVideoElement(): HTMLVideoElement;
  onFrame(cb: (frame: ImageBitmap) => void): () => void;
  readonly isActive: boolean;
}

export function createCameraStream(options: CameraOptions = {}): CameraStream {
  const width = options.width ?? 640;
  const height = options.height ?? 480;
  const facingMode = options.facingMode ?? "user";
  const inferenceWidth = options.inferenceWidth ?? 640;
  const inferenceHeight = options.inferenceHeight ?? 480;

  const video = document.createElement("video");
  video.setAttribute("playsinline", "");
  video.setAttribute("autoplay", "");
  video.muted = true;

  let stream: MediaStream | null = null;
  let active = false;
  let lastVideoTime = -1;
  const frameCbs = new Set<(frame: ImageBitmap) => void>();

  let useCanvasFallback = false;
  let fallbackCanvas: HTMLCanvasElement | null = null;
  let fallbackCtx: CanvasRenderingContext2D | null = null;

  function computeCrop(): { sx: number; sy: number; sw: number; sh: number } {
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (vw === 0 || vh === 0) return { sx: 0, sy: 0, sw: vw, sh: vh };

    const targetAspect = inferenceWidth / inferenceHeight;
    const videoAspect = vw / vh;

    let sx = 0,
      sy = 0,
      sw = vw,
      sh = vh;
    if (videoAspect > targetAspect) {
      sw = Math.round(vh * targetAspect);
      sx = Math.round((vw - sw) / 2);
    } else if (videoAspect < targetAspect) {
      sh = Math.round(vw / targetAspect);
      sy = Math.round((vh - sh) / 2);
    }
    return { sx, sy, sw, sh };
  }

  async function grabFrame(): Promise<ImageBitmap | null> {
    const { sx, sy, sw, sh } = computeCrop();
    if (sw === 0 || sh === 0) return null;

    if (!useCanvasFallback) {
      try {
        return await createImageBitmap(video, sx, sy, sw, sh, {
          resizeWidth: inferenceWidth,
          resizeHeight: inferenceHeight,
        });
      } catch {
        useCanvasFallback = true;
      }
    }
    if (!fallbackCanvas) {
      fallbackCanvas = document.createElement("canvas");
      fallbackCanvas.width = inferenceWidth;
      fallbackCanvas.height = inferenceHeight;
      fallbackCtx = fallbackCanvas.getContext("2d");
    }
    if (!fallbackCtx) return null;
    fallbackCtx.drawImage(
      video,
      sx,
      sy,
      sw,
      sh,
      0,
      0,
      inferenceWidth,
      inferenceHeight,
    );
    const imageData = fallbackCtx.getImageData(
      0,
      0,
      inferenceWidth,
      inferenceHeight,
    );
    return createImageBitmap(imageData);
  }

  function frameLoop() {
    if (!active) return;

    const schedule = () => {
      if ("requestVideoFrameCallback" in video) {
        (video as any).requestVideoFrameCallback(() => frameLoop());
      } else {
        requestAnimationFrame(() => frameLoop());
      }
    };

    if (video.currentTime === lastVideoTime) {
      schedule();
      return;
    }
    lastVideoTime = video.currentTime;

    if (frameCbs.size === 0) {
      schedule();
      return;
    }

    grabFrame()
      .then((bitmap) => {
        if (bitmap) {
          for (const cb of frameCbs) cb(bitmap);
        }
        schedule();
      })
      .catch(() => {
        schedule();
      });
  }

  function handleVisibilityChange() {
    if (document.hidden) {
      active = false;
    } else if (stream && !active) {
      active = true;
      frameLoop();
    }
  }

  return {
    async start() {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode,
          width: { ideal: width },
          height: { ideal: height },
        },
        audio: false,
      });
      video.srcObject = stream;
      await video.play();
      active = true;
      document.addEventListener("visibilitychange", handleVisibilityChange);
      frameLoop();
    },

    stop() {
      active = false;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (stream) {
        for (const track of stream.getTracks()) track.stop();
        stream = null;
      }
      video.srcObject = null;
    },

    getVideoElement() {
      return video;
    },

    onFrame(cb) {
      frameCbs.add(cb);
      return () => {
        frameCbs.delete(cb);
      };
    },

    get isActive() {
      return active;
    },
  };
}
