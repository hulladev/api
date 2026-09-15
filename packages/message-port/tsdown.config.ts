import { defineConfig } from 'tsdown'

export default defineConfig({
  clean: true,
  dts: true,
  entry: ['src/index.ts', 'src/desktop.ts', 'src/electron.ts', 'src/tauri.ts', 'src/dioxus.ts'],
  fixedExtension: false,
  format: ['esm'],
  minify: false,
  outDir: 'dist',
  publint: true,
  tsconfig: 'tsconfig.build.json',
})
