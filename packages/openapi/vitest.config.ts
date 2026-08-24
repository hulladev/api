import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
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
