import { defineConfig } from 'tsdown'

export default defineConfig({
  clean: true,
  dts: true,
  entry: [
    'src/index.ts',
    'src/client/index.ts',
    'src/compiler.ts',
    'src/errors.ts',
    'src/integration.ts',
    'src/server/index.ts',
    'src/stream.ts',
    'src/validation.ts',
    'src/wire.ts',
  ],
  fixedExtension: false,
  format: ['esm'],
  minify: false,
  outDir: 'dist',
  publint: true,
})
