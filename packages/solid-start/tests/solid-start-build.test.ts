import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

const viteBin = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url))
const fixtureSource = fileURLToPath(new URL('./fixtures/solid-start-app', import.meta.url))
const temporaryRoot = fileURLToPath(new URL('../.solid-start/test-fixtures', import.meta.url))
const nodeBinary = process.env['SOLID_START_NODE_BINARY'] ?? 'node'
const nodeVersion = spawnSync(nodeBinary, ['--version'], { encoding: 'utf8' }).stdout.trim()
const nodeMajor = Number.parseInt(nodeVersion.replace(/^v/, '').split('.')[0] ?? '', 10)

describe('SolidStart build integration', () => {
  test.skipIf(nodeMajor < 24)(
    'builds a production app with a contract-backed catch-all API route',
    () => {
      mkdirSync(temporaryRoot, { recursive: true })
      const fixture = mkdtempSync(join(temporaryRoot, 'solid-start-app-'))
      cpSync(fixtureSource, fixture, { recursive: true })

      try {
        const result = spawnSync(nodeBinary, [viteBin, 'build'], {
          cwd: fixture,
          encoding: 'utf8',
          timeout: 120_000,
        })

        expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0)
      } finally {
        rmSync(fixture, { force: true, recursive: true })
      }
    },
    120_000
  )
})
