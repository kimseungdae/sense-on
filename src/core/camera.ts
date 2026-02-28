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
  const inferenceWidth = options.inferenceWidth ?? 320;
  const inferenceHeight = options.inferenceHeight ?? 240;

  const video = document.createElement("video");
  video.setAttribute("playsinline", "");
  video.setAttribute("autoplay", "");
  video.muted = true;

  let stream: MediaStream | null = null;
  let active = false;
  let lastVideoTime = -1;
  const frameCbs = new Set<(frame: ImageBitmap) => void>();

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

    createImageBitmap(video, {
      resizeWidth: inferenceWidth,
      resizeHeight: inferenceHeight,
    })
      .then((bitmap) => {
        for (const cb of frameCbs) cb(bitmap);
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
