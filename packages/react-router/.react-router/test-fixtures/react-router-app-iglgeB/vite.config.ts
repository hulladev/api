import { fileURLToPath } from 'node:url'
import { reactRouter } from '@react-router/dev/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [reactRouter()],
  resolve: {
    alias: {
      '@hulla/api-react-router': fileURLToPath(new URL('../../../dist/index.js', import.meta.url)),
    },
  },
})
