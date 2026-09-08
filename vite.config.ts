import { defineConfig } from 'vite'

export default defineConfig({
  root: 'web',
  build: { outDir: 'dist' },
  // `deno task dev:web`(vite) + `deno task dev:api`(wrangler dev) 병행 시 프록시
  server: {
    proxy: { '/api': 'http://localhost:8787' },
  },
})
