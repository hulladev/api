import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    port: 3000,
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
  resolve: {
    dedupe: [
      '@tanstack/db',
      '@tanstack/query-core',
      '@tanstack/query-db-collection',
      '@tanstack/react-db',
      '@tanstack/react-query',
    ],
    alias: [
      {
        find: /^@hulla\/api$/,
        replacement: '@hulla/api/runtime',
      },
    ],
    tsconfigPaths: true,
  },
  plugins: [tanstackStart(), viteReact()],
})
