import { defineConfig } from 'tsdown'

export default defineConfig({
  clean: true,
  dts: true,
  entry: ['src/index.ts', 'src/pages.ts'],
  fixedExtension: false,
  format: ['esm'],
  minify: false,
  outDir: 'dist',
  publint: true,
})
