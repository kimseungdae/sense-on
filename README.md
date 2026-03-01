# sense-on

> On-device face tracking and attention monitoring for the web.
> MediaPipe-powered, 100% client-side, privacy-first.

[![npm version](https://img.shields.io/npm/v/sense-on.svg)](https://www.npmjs.com/package/sense-on)
[![license](https://img.shields.io/npm/l/sense-on.svg)](https://github.com/kimseungdae/sense-on/blob/master/LICENSE)

[English](#features) | [한국어](#한국어)

---

## Features

- **100% client-side** — MediaPipe Face Landmarker runs via WASM in a Web Worker. No server, no data leaves the device.
- **Attention detection** — Classifies user state as `attentive`, `looking_away`, `drowsy`, or `absent`.
- **Head pose estimation** — Extracts yaw, pitch, roll from the facial transformation matrix.
- **Eye Aspect Ratio (EAR)** — Computes eye openness for drowsiness detection.
- **One Euro Filter** — Jitter-free smoothing for head pose and landmark values.
- **Off-main-thread** — Face detection runs entirely in a Web Worker for smooth UI.
- **Framework-agnostic core** — Use with React, Svelte, vanilla JS via `sense-on/core`.
- **Face mesh constants** — Tessellation, eye, iris, lip, and face oval connection arrays for visualization.

## Architecture

```
Camera (getUserMedia)
  → CameraStream (requestVideoFrameCallback loop)
    → ImageBitmap → Web Worker
      → MediaPipe FaceLandmarker (WASM, GPU fallback to CPU)
        → TrackingResult { landmarks, headPose, faceCenter }
          → computeAttention() → AttentionState
            → UI (wireframe + metrics)
```

## Quick Start

### Install

```bash
npm install sense-on @mediapipe/tasks-vision
```

### Download Model

The MediaPipe Face Landmarker model (~5 MB) is required at runtime. Place it in your public directory:

```bash
curl -o public/models/face_landmarker.task \
  https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task
```

### Framework-Agnostic Usage

```typescript
import {
  createCameraStream,
  createTrackerClient,
  computeAttention,
} from "sense-on/core";

const camera = createCameraStream();
const tracker = createTrackerClient({
  modelPath: "/models/face_landmarker.task",
});

await tracker.init();
await camera.start();

tracker.onResult((data) => {
  const attention = computeAttention(data);
  console.log(attention.state); // 'attentive' | 'looking_away' | 'drowsy' | 'absent'
  console.log(attention.headYaw); // degrees
  console.log(attention.eyeOpenness); // EAR value
});

camera.onFrame((frame) => {
  tracker.detect(frame, performance.now());
});
```

### Vue 3 Usage

```vue
<script setup>
import { onMounted, onUnmounted } from "vue";
import {
  createCameraStream,
  createTrackerClient,
  computeAttention,
} from "sense-on";

// ... same as above, with reactive state
</script>
```

## API Reference

### Core Functions

| Function                        | Description                                        |
| ------------------------------- | -------------------------------------------------- |
| `createCameraStream(options?)`  | Creates a camera stream with frame loop            |
| `createTrackerClient(options?)` | Creates a Web Worker-based face tracker            |
| `computeAttention(result)`      | Computes attention state from tracking result      |
| `computeEAR(landmarks)`         | Computes Eye Aspect Ratio from 478 landmarks       |
| `matrixToEuler(matrix)`         | Converts 4x4 transformation matrix to Euler angles |
| `createOneEuroFilter(options?)` | Creates a One Euro Filter for smoothing            |
| `createPointFilter(options?)`   | Creates a 2D point filter                          |

### Types

| Type                  | Description                                                      |
| --------------------- | ---------------------------------------------------------------- |
| `AttentionState`      | `'attentive' \| 'looking_away' \| 'drowsy' \| 'absent'`          |
| `AttentionResult`     | `{ state, headYaw, headPitch, eyeOpenness, facePresent }`        |
| `TrackingResult`      | `{ faceCenter?, headPose?, landmarks?, inferenceMs, timestamp }` |
| `EulerAngles`         | `{ yaw, pitch, roll }` in degrees                                |
| `Point2D` / `Point3D` | Coordinate types                                                 |

### Attention States

| State          | Condition                                      | Color  |
| -------------- | ---------------------------------------------- | ------ |
| `attentive`    | Face present, forward-facing, eyes open        | Green  |
| `looking_away` | Face present, \|yaw\| > 25° or \|pitch\| > 20° | Yellow |
| `drowsy`       | Face present, EAR < 0.2 for 2+ seconds         | Orange |
| `absent`       | No face detected                               | Red    |

### Face Mesh Constants

```typescript
import {
  TESSELATION,
  LEFT_EYE,
  RIGHT_EYE,
  LEFT_IRIS,
  RIGHT_IRIS,
  LIPS,
  FACE_OVAL,
} from "sense-on/core";
```

Each constant is a `[number, number][]` array of landmark index pairs for drawing connections.

## Browser Requirements

- Modern browser with WebAssembly support
- `getUserMedia` API (camera access)
- `createImageBitmap` API
- Web Worker support

Tested on Chrome 90+, Firefox 90+, Edge 90+, Safari 15.4+.

## License

[Apache 2.0](./LICENSE)

---

# 한국어

> 브라우저 기반 얼굴 추적 및 주의력 모니터링 라이브러리.
> MediaPipe 기반, 100% 클라이언트 사이드, 프라이버시 우선.

## 주요 기능

- **100% 클라이언트 사이드** — 서버 불필요, 데이터가 기기를 떠나지 않음
- **주의력 감지** — `attentive`(집중), `looking_away`(시선 이탈), `drowsy`(졸림), `absent`(자리 비움)
- **머리 자세 추정** — yaw/pitch/roll 각도 추출
- **눈 개폐 비율(EAR)** — 졸음 감지용
- **Web Worker 추론** — 메인 스레드 블로킹 없음

## 빠른 시작

```bash
npm install sense-on @mediapipe/tasks-vision
```

```typescript
import {
  createCameraStream,
  createTrackerClient,
  computeAttention,
} from "sense-on/core";

const camera = createCameraStream();
const tracker = createTrackerClient({
  modelPath: "/models/face_landmarker.task",
});

await tracker.init();
await camera.start();

tracker.onResult((data) => {
  const { state, headYaw, eyeOpenness } = computeAttention(data);
  // state: 'attentive' | 'looking_away' | 'drowsy' | 'absent'
});

camera.onFrame((frame) => tracker.detect(frame, performance.now()));
```

## 주요 API

| 함수                            | 설명                            |
| ------------------------------- | ------------------------------- |
| `createCameraStream(options?)`  | 카메라 스트림 + 프레임 루프     |
| `createTrackerClient(options?)` | Web Worker 기반 얼굴 추적기     |
| `computeAttention(result)`      | TrackingResult → AttentionState |
| `computeEAR(landmarks)`         | 478 랜드마크 → 눈 개폐 비율     |

## 라이선스

[Apache 2.0](./LICENSE)
