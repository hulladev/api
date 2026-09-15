import { fileURLToPath } from 'node:url'

export default defineNuxtConfig({
  // Let Nitro bundle core once for both SSR clients and server endpoints.
  vite: { ssr: { external: ['@hulla/api'] } },
  alias: {
    '@hulla/api-nuxt/client': fileURLToPath(new URL('../../../dist/client.js', import.meta.url)),
    '@hulla/api-nuxt/server': fileURLToPath(new URL('../../../dist/server.js', import.meta.url)),
  },
  compatibilityDate: '2026-08-26',
  devtools: { enabled: false },
})
