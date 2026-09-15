import { fileURLToPath } from 'node:url'
import { sveltekit } from '@sveltejs/kit/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [sveltekit()],
  resolve: {
    alias: {
      '@hulla/api-sveltekit/server': fileURLToPath(new URL('../../../dist/server.js', import.meta.url)),
      '@hulla/api-sveltekit/remote': fileURLToPath(new URL('../../../dist/remote.js', import.meta.url)),
    },
  },
})
