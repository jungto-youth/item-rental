import { defineConfig } from 'vite'

export default defineConfig({
  root: 'web',
  build: { outDir: 'dist' },
  // `npm run dev`(vite HMR) + `npm run dev:api`(wrangler dev) 병행 시 프록시
  server: {
    port: 5173,
    // 포트가 이미 사용 중이면 5174로 밀리지 않고 바로 알린다 (문서·프록시 주소 고정)
    strictPort: true,
    proxy: { '/api': 'http://localhost:8787' },
  },
})
