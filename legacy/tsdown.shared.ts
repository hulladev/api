import type { UserConfig } from 'tsdown'

export const sharedTsdownConfig: UserConfig = {
  clean: true,
  dts: true,
  entry: 'src/index.ts',
  fixedExtension: false,
  format: ['esm', 'cjs'],
  minify: true,
  outDir: 'dist',
  publint: true,
}
