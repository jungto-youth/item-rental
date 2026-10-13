import { defineConfig } from 'vite'

export default defineConfig({
  root: 'web',
  build: { outDir: 'dist' },
  // `npm run dev:web`(vite) + `npm run dev:api`(wrangler dev) 병행 시 프록시
  server: {
    proxy: { '/api': 'http://localhost:8787' },
  },
})
