import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import solid from "@solidjs/vite-plugin";

// 메인 웹 앱은 web/ (SolidJS) 이고, 이 설정이 배포 산출물(web/dist)을 만든다.
// Lit 원본은 web-lit/ 에 있고 자기 설정(web-lit/vite.config.ts)을 쓴다.
export default defineConfig({
  root: fileURLToPath(new URL("./web/", import.meta.url)),
  // 실제 앱과 같은 경로 라우팅 — 서버(Workers)가 SPA 폴백을 맡는다.
  base: "/",
  plugins: [solid(), tailwindcss()],
  build: { outDir: "dist" },
  // `npm run dev`(vite HMR) + `npm run dev:api`(wrangler dev) 병행 시 프록시
  server: {
    port: 5173,
    // 포트가 이미 사용 중이면 5174로 밀리지 않고 바로 알린다 (문서·프록시 주소 고정)
    strictPort: true,
    proxy: { "/api": "http://localhost:8787" },
  },
});
