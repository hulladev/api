import { resolve } from 'node:path'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@hulla/api': resolve(__dirname, 'packages/core/src/index.ts'),
      '@hulla/api-fetch': resolve(__dirname, 'packages/fetch/src/index.ts'),
      '@hulla/api-query': resolve(__dirname, 'packages/query/src/index.ts'),
      '@hulla/api-swr': resolve(__dirname, 'packages/swr/src/index.ts'),
    },
  },
})
