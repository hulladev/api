import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

const nuxtBin = fileURLToPath(new URL('../node_modules/nuxt/bin/nuxt.mjs', import.meta.url))
const fixtureSource = fileURLToPath(new URL('./fixtures/nuxt-app', import.meta.url))
const temporaryRoot = fileURLToPath(new URL('../.nuxt/test-fixtures', import.meta.url))

describe('Nuxt build integration', () => {
  test('builds a production app with hosting and request-aware client transport', () => {
    mkdirSync(temporaryRoot, { recursive: true })
    const fixture = mkdtempSync(join(temporaryRoot, 'nuxt-app-'))
    cpSync(fixtureSource, fixture, { recursive: true })

    try {
      const result = spawnSync(process.execPath, [nuxtBin, 'build'], {
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
