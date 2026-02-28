import { createRouter, createWebHistory } from "vue-router";
import HomeView from "./views/HomeView.vue";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", component: HomeView },
    { path: "/demo", component: () => import("./views/DemoView.vue") },
    {
      path: "/calibrate",
      component: () => import("./views/CalibrationView.vue"),
    },
    { path: "/reader", component: () => import("./views/ReaderView.vue") },
  ],
});

export default router;
