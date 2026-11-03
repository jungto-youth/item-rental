import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// Lit 원본 앱. 배포 대상은 web/ (SolidJS) 이고, 이 앱은 비교·시각 회귀 검증용으로 남긴다.
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  build: { outDir: "dist" },
  server: {
    port: 5175,
    strictPort: true,
    proxy: { "/api": "http://localhost:8787" },
  },
});
