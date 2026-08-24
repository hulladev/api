import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

const nextBin = fileURLToPath(new URL('../node_modules/next/dist/bin/next', import.meta.url))
const fixtureSource = fileURLToPath(new URL('./fixtures/next-app', import.meta.url))
const temporaryRoot = fileURLToPath(new URL('../.next/test-fixtures', import.meta.url))

describe('Next.js build integration', () => {
  test('builds App Router server and client entrypoint consumers', () => {
    mkdirSync(temporaryRoot, { recursive: true })
    const fixture = mkdtempSync(join(temporaryRoot, 'next-app-'))
    cpSync(fixtureSource, fixture, { recursive: true })

    try {
      const result = spawnSync(process.execPath, [nextBin, 'build', fixture], {
        encoding: 'utf8',
        env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
        timeout: 120_000,
      })

      expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0)
    } finally {
      rmSync(fixture, { force: true, recursive: true })
    }
  }, 120_000)
})
