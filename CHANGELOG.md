# Changelog

All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/).

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

[0.1.0]: https://github.com/kimseungdae/sense-on/releases/tag/v0.1.0
