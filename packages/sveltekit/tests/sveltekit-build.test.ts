import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

const viteBin = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url))
const fixtureSource = fileURLToPath(new URL('./fixtures/sveltekit-app', import.meta.url))
const temporaryRoot = fileURLToPath(new URL('../.svelte-kit/test-fixtures', import.meta.url))

describe('SvelteKit build integration', () => {
  test('builds a production app with a contract-backed catch-all endpoint', () => {
    mkdirSync(temporaryRoot, { recursive: true })
    const fixture = mkdtempSync(join(temporaryRoot, 'sveltekit-app-'))
    cpSync(fixtureSource, fixture, { recursive: true })

    try {
      const result = spawnSync(process.execPath, [viteBin, 'build'], {
        cwd: fixture,
        encoding: 'utf8',
        timeout: 120_000,
      })

      expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0)
    } finally {
      rmSync(fixture, { force: true, recursive: true })
    }
  }, 120_000)
})
