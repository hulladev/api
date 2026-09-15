import { defineConfig } from 'tsdown'

export default defineConfig({
  clean: true,
  dts: true,
  tsconfig: 'tsconfig.build.json',
  entry: ['src/client.ts', 'src/server.ts'],
  fixedExtension: false,
  format: ['esm'],
  minify: false,
  outDir: 'dist',
  publint: true,
})
