import { defineConfig } from 'tsdown'
import { sharedTsdownConfig } from '../../tsdown.shared.ts'

export default defineConfig({
  ...sharedTsdownConfig,
  entry: ['src/index.ts', 'src/cli.ts'],
})
