import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@hulla/api/server': fileURLToPath(new URL('../core/src/server/index.ts', import.meta.url)),
      '@hulla/api/fetch': fileURLToPath(new URL('../core/src/fetch/index.ts', import.meta.url)),
      '@hulla/api': fileURLToPath(new URL('../core/src/index.ts', import.meta.url)),
    },
  },
  test: {
    coverage: {
      include: ['src/**/*.ts'],
      reporter: ['text', 'json', 'html'],
    },
    include: ['tests/**/*.test.ts'],
  },
})
