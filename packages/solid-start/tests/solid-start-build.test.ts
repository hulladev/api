import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'
import { frameworkBuildEnv, javascriptOutput, startFixture } from '../../../scripts/framework-test-utils'

const viteBin = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url))
const fixtureSource = fileURLToPath(new URL('./fixtures/solid-start-app', import.meta.url))
const temporaryRoot = fileURLToPath(new URL('../.solid-start/test-fixtures', import.meta.url))
const nodeBinary = process.env['SOLID_START_NODE_BINARY'] ?? 'node'
const nodeVersion = spawnSync(nodeBinary, ['--version'], { encoding: 'utf8' }).stdout.trim()
const nodeMajor = Number.parseInt(nodeVersion.replace(/^v/, '').split('.')[0] ?? '', 10)

describe('SolidStart build integration', () => {
  test.skipIf(nodeMajor < 24)(
    'builds a server-function query and excludes its implementation from browser output',
    async () => {
      mkdirSync(temporaryRoot, { recursive: true })
      const fixture = mkdtempSync(join(temporaryRoot, 'solid-start-app-'))
      cpSync(fixtureSource, fixture, { recursive: true })

      let running: Awaited<ReturnType<typeof startFixture>> | undefined
      try {
        const result = spawnSync(nodeBinary, [viteBin, 'build'], {
          cwd: fixture,
          encoding: 'utf8',
          env: frameworkBuildEnv(),
          timeout: 120_000,
        })

        expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0)
        expect(javascriptOutput(join(fixture, 'dist/server'))).toContain('HULLA_PRIVATE_DATABASE_IMPLEMENTATION')
        expect(javascriptOutput(join(fixture, 'dist/client'))).not.toContain('HULLA_PRIVATE_DATABASE_IMPLEMENTATION')
        running = await startFixture(
          nodeBinary,
          (port) => [viteBin, 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
          fixture
        )
        const page = await fetch(running.origin)
        expect(page.status).toBe(200)
        expect(await page.text()).toMatch(/fixture: (?:<!--.*?-->)*ok/)
        const response = await fetch(`${running.origin}/api/health`)
        expect(response.status).toBe(200)
        expect(await response.text()).toBe('ok')
      } finally {
        await running?.stop()
        rmSync(fixture, { force: true, recursive: true })
      }
    },
    120_000
  )
})
