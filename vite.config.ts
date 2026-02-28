import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  worker: {
    format: "iife",
  },
  optimizeDeps: {
    exclude: ["@mediapipe/tasks-vision"],
  },
});
