import { resolve } from 'node:path'
import { runGenerateConfig } from '@hulla/api'
import config from '../api.config'

const cwd = resolve(import.meta.dirname, '..')

await runGenerateConfig(config, { cwd, configPath: 'api.config.ts' })
