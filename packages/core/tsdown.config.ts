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
    'src/procedure.ts',
    'src/server/index.ts',
    { wire: 'src/server/runtime.ts' },
    'src/stream.ts',
    'src/validation.ts',
  ],
  fixedExtension: false,
  format: ['esm'],
  minify: false,
  outDir: 'dist',
  publint: true,
})
