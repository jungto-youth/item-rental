import { defineConfig } from 'vitest/config'

// vite.config.ts 는 root 가 web 이라 그 상태로는 루트의 서버 테스트를 찾지 못한다.
// Vitest 는 vitest.config.* 를 먼저 쓰므로 루트 기준으로 분리해 둔다.
export default defineConfig({
  test: {
    include: ['server/tests/**/*_test.ts'],
  },
})