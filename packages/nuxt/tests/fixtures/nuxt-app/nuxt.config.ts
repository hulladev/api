import { fileURLToPath } from 'node:url'

export default defineNuxtConfig({
  alias: {
    '@hulla/api-nuxt/client': fileURLToPath(new URL('../../../dist/client.js', import.meta.url)),
    '@hulla/api-nuxt/server': fileURLToPath(new URL('../../../dist/server.js', import.meta.url)),
  },
  compatibilityDate: '2026-08-26',
  devtools: { enabled: false },
})
