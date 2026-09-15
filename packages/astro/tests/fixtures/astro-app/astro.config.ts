import { fileURLToPath } from 'node:url'
import node from '@astrojs/node'
import { defineConfig } from 'astro/config'

export default defineConfig({
  adapter: node({ mode: 'standalone' }),
  output: 'static',
  vite: {
    resolve: {
      alias: {
        '@hulla/api-astro': fileURLToPath(new URL('../../../dist/index.js', import.meta.url)),
      },
    },
  },
})
