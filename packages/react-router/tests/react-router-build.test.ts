import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createRequestHandler, type ServerBuild } from 'react-router'
import { describe, expect, test } from 'vitest'

const viteBin = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url))
const fixtureSource = fileURLToPath(new URL('./fixtures/react-router-app', import.meta.url))
const temporaryRoot = fileURLToPath(new URL('../.react-router/test-fixtures', import.meta.url))

describe('React Router v7 build integration', () => {
  test('builds and dispatches a production app with a contract-backed resource route', async () => {
    mkdirSync(temporaryRoot, { recursive: true })
    const fixture = mkdtempSync(join(temporaryRoot, 'react-router-app-'))
    cpSync(fixtureSource, fixture, { recursive: true })

    try {
      const result = spawnSync(process.execPath, [viteBin, 'build'], {
        cwd: fixture,
        encoding: 'utf8',
        timeout: 120_000,
      })

      expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0)

      const build = (await import(pathToFileURL(join(fixture, 'build/server/index.js')).href)) as ServerBuild
      const handler = createRequestHandler(build, 'production')

      const page = await handler(new Request('https://example.com/'))
      expect(page.status).toBe(200)
      expect(await page.text()).toContain('id="local-health">ok')

      const getResponse = await handler(new Request('https://example.com/api/health'))
      expect(getResponse.status).toBe(200)
      await expect(getResponse.json()).resolves.toBe('ok')

      const headResponse = await handler(new Request('https://example.com/api/health', { method: 'HEAD' }))
      expect(headResponse.status).toBe(200)
      await expect(headResponse.text()).resolves.toBe('')

      const postResponse = await handler(new Request('https://example.com/api/health', { method: 'POST' }))
      expect(postResponse.status).toBe(405)
    } finally {
      rmSync(fixture, { force: true, recursive: true })
    }
  }, 120_000)
})
