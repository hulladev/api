import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '')

  return {
    plugins: [react()],
    server: {
      port: 3000,
      proxy: {
        '/api': env.API_ORIGIN ?? 'http://localhost:3001',
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
    },
  }
})
