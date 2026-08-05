import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests.ai/**/*.test.ts'],
  },
})
