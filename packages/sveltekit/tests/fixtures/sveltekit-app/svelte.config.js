import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'

export default {
  compilerOptions: {
    experimental: { async: true },
  },
  kit: {
    experimental: { remoteFunctions: true },
  },
  preprocess: vitePreprocess(),
}
