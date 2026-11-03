import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import solid from "@solidjs/vite-plugin";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  // 실제 앱과 같은 경로 라우팅 — 서버(Workers)가 SPA 폴백을 맡는다.
  base: "/",
  plugins: [solid()],
  server: {
    port: 5175,
    strictPort: true,
    // `npm run dev`(API)와 함께 쓸 때 /api 를 wrangler dev 로 넘긴다.
    proxy: { "/api": "http://localhost:8787" },
  },
  build: { outDir: "dist" },
});
