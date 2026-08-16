import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    coverage: {
      include: ['src/codec.ts', 'src/query.ts', 'src/route-input.ts', 'src/text.ts'],
      reporter: ['text', 'json', 'html'],
      thresholds: {
        branches: 85,
        functions: 100,
        lines: 100,
        statements: 95,
      },
    },
    include: ['tests/**/*.test.ts'],
  },
})
