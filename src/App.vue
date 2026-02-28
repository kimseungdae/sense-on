<script setup lang="ts">
import GazeDemo from './components/GazeDemo.vue';
</script>

<template>
  <div class="app">
    <h1>sense-on</h1>
    <p class="subtitle">On-device gaze tracking</p>
    <GazeDemo />
  </div>
</template>

<style scoped>
.app {
  padding: 20px;
  min-height: 100vh;
  background: #0d1117;
  color: #e6edf3;
}

h1 {
  text-align: center;
  font-size: 24px;
  margin: 0 0 4px;
  font-weight: 600;
}

.subtitle {
  text-align: center;
  color: #888;
  margin: 0 0 20px;
  font-size: 14px;
}
</style>
