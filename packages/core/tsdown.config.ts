import { defineConfig } from 'tsdown'
import { sharedTsdownConfig } from '../../tsdown.shared.ts'

export default defineConfig({
  ...sharedTsdownConfig,
  entry: [
    'src/index.ts',
    'src/runtime.ts',
    'src/server.ts',
    'src/client.ts',
    'src/plugin.ts',
    'src/zod.ts',
    'src/cli.ts',
  ],
})
