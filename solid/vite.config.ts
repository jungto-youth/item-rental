import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import solid from "@solidjs/vite-plugin";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  // dist 를 정적 서버 없이 열어도 동작하도록 상대 경로로 낸다.
  base: "./",
  plugins: [solid(), tailwindcss()],
  server: { port: 5174, strictPort: true },
  build: { outDir: "dist" },
});
