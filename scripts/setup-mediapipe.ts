import { existsSync, mkdirSync, writeFileSync } from "fs";
import { resolve } from "path";

const MODELS_DIR = resolve(import.meta.dirname, "..", "public", "models");
const FACE_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const FACE_MODEL_PATH = resolve(MODELS_DIR, "face_landmarker.task");

async function main() {
  if (!existsSync(MODELS_DIR)) {
    mkdirSync(MODELS_DIR, { recursive: true });
  }

  if (existsSync(FACE_MODEL_PATH)) {
    console.log("face_landmarker.task already exists, skipping download.");
    return;
  }

  console.log("Downloading face_landmarker.task (~5MB)...");
  const res = await fetch(FACE_MODEL_URL);
  if (!res.ok)
    throw new Error(`Download failed: ${res.status} ${res.statusText}`);

  const buffer = Buffer.from(await res.arrayBuffer());
  writeFileSync(FACE_MODEL_PATH, buffer);
  console.log(
    `Saved to ${FACE_MODEL_PATH} (${(buffer.length / 1024 / 1024).toFixed(1)}MB)`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
