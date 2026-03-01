import { createRouter, createWebHistory } from "vue-router";
import HomeView from "./views/HomeView.vue";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", component: HomeView },
    {
      path: "/attention",
      component: () => import("./views/AttentionView.vue"),
    },
    { path: "/demo", component: () => import("./views/DemoView.vue") },
  ],
});

export default router;
