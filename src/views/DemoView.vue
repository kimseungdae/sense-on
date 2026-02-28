<script setup lang="ts">
import GazeDemo from '../components/GazeDemo.vue';
</script>

<template>
  <div class="demo-view">
    <header>
      <router-link to="/" class="back">&larr; Home</router-link>
      <h1>sense-on</h1>
      <p class="subtitle">On-device gaze tracking</p>
    </header>
    <GazeDemo />
  </div>
</template>

<style scoped>
.demo-view {
  padding: 20px;
  min-height: 100vh;
  background: #0d1117;
  color: #e6edf3;
}

header {
  max-width: 640px;
  margin: 0 auto 12px;
}

.back {
  color: #4a90d9;
  text-decoration: none;
  font-size: 14px;
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
