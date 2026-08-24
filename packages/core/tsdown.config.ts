import { defineConfig } from 'tsdown'

export default defineConfig({
  clean: true,
  dts: true,
  entry: [
    'src/index.ts',
    'src/adapters/index.ts',
    'src/client/index.ts',
    'src/compiler.ts',
    'src/errors.ts',
    'src/fetch/index.ts',
    'src/in-process.ts',
    'src/procedure.ts',
    'src/server/index.ts',
    'src/stream.ts',
    'src/validation.ts',
  ],
  fixedExtension: false,
  format: ['esm'],
  minify: false,
  outDir: 'dist',
  publint: true,
})
