# Changelog

All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [0.1.1] - 2026-03-02

### Fixed

- Fix mobile camera loading failure caused by blob URL `importScripts()` in Web Worker (iOS Safari, Android)
- Add canvas-based fallback for `createImageBitmap` resize options unsupported on iOS Safari
- Force CPU delegate for MediaPipe — GPU delegate produces garbage data in mobile Workers
- Fix Vercel SPA rewrite intercepting `/models/` static files (404 on model load)
- Add build-time model download so `.gitignore`d model file is available on Vercel
- Display error messages on HomeView when tracker initialization fails
- Increase tracker init timeout from 15s to 45s for slower mobile networks
- Center-crop camera frame to match display aspect ratio — fixes wireframe misalignment on 16:9 mobile cameras
- Lower head pose thresholds (yaw 25°→18°, pitch 20°→15°) for more sensitive attention detection
- Increase One-Euro filter responsiveness (minCutoff 1.0→1.5, beta 0.3→0.5) for faster head turn detection

## [0.1.0] - 2026-03-01

Initial release of sense-on.

### Added

- On-device face tracking with MediaPipe Face Landmarker via Web Worker
- Attention detection system (attentive, looking_away, drowsy, absent)
- Head pose estimation (yaw/pitch/roll) from facial transformation matrix
- Eye Aspect Ratio (EAR) computation for drowsiness detection
- One Euro Filter for jitter-free landmark smoothing
- Camera stream abstraction with requestVideoFrameCallback
- Face mesh wireframe visualization constants
- Framework-agnostic core (`sense-on/core`)
- Vue 3 demo app with real-time attention dashboard
- Bilingual demo (English/Korean toggle)
- 22 unit tests (attention, filter, head-pose)

[0.1.1]: https://github.com/kimseungdae/sense-on/releases/tag/v0.1.1
[0.1.0]: https://github.com/kimseungdae/sense-on/releases/tag/v0.1.0
