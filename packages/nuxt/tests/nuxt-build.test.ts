import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'
import { frameworkBuildEnv, startFixture } from '../../../scripts/framework-test-utils'

const nuxtBin = fileURLToPath(new URL('../node_modules/nuxt/bin/nuxt.mjs', import.meta.url))
const fixtureSource = fileURLToPath(new URL('./fixtures/nuxt-app', import.meta.url))
const temporaryRoot = fileURLToPath(new URL('../.nuxt/test-fixtures', import.meta.url))

describe('Nuxt build integration', () => {
  test('renders concurrent SSR sessions through the request-aware client and exposes the endpoint', async () => {
    mkdirSync(temporaryRoot, { recursive: true })
    const fixture = mkdtempSync(join(temporaryRoot, 'nuxt-app-'))
    cpSync(fixtureSource, fixture, { recursive: true })

    let running: Awaited<ReturnType<typeof startFixture>> | undefined
    try {
      const result = spawnSync(process.execPath, [nuxtBin, 'build'], {
        cwd: fixture,
        encoding: 'utf8',
        env: frameworkBuildEnv(),
        timeout: 120_000,
      })

      expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0)
      running = await startFixture(process.execPath, () => [join(fixture, '.output/server/index.mjs')], fixture)
      const origin = running.origin
      const response = await fetch(`${origin}/api/health`, { headers: { cookie: 'session=grace' } })
      expect(response.status, `${await response.clone().text()}\n${running.output()}`).toBe(200)
      expect(await response.json()).toEqual({ ok: true, actor: 'Grace' })
      const pages = await Promise.all(
        ['ada', 'grace', 'ada', 'grace'].map(async (session) => {
          const response = await fetch(origin, { headers: { cookie: `session=${session}` } })
          expect(response.status).toBe(200)
          return response.text()
        })
      )
      pages.forEach((html, index) => expect(html).toContain(`true as ${index % 2 === 0 ? 'Ada' : 'Grace'}`))
    } finally {
      await running?.stop()
      rmSync(fixture, { force: true, recursive: true })
    }
  }, 120_000)
})
