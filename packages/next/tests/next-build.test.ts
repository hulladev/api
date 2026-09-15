import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'
import { frameworkBuildEnv, javascriptOutput, startFixture } from '../../../scripts/framework-test-utils'
import { createBrowserApi } from './fixtures/next-app/browser-client'

const nextBin = fileURLToPath(new URL('../node_modules/next/dist/bin/next', import.meta.url))
const fixtureSource = fileURLToPath(new URL('./fixtures/next-app', import.meta.url))
const temporaryRoot = fileURLToPath(new URL('../.next/test-fixtures', import.meta.url))

function fixtureDirectory() {
  mkdirSync(temporaryRoot, { recursive: true })
  const fixture = mkdtempSync(join(temporaryRoot, 'next-app-'))
  cpSync(fixtureSource, fixture, { recursive: true })
  return fixture
}

function build(fixture: string) {
  return spawnSync(process.execPath, [nextBin, 'build', fixture], {
    encoding: 'utf8',
    env: frameworkBuildEnv(),
    timeout: 120_000,
  })
}

describe('Next.js hybrid integration', () => {
  test('prerenders locally, isolates dynamic request identity and exposes a browser-safe HTTP client', async () => {
    const fixture = fixtureDirectory()
    let running: Awaited<ReturnType<typeof startFixture>> | undefined
    try {
      const result = build(fixture)
      expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0)
      expect(readFileSync(join(fixture, '.next/server/app/index.html'), 'utf8')).toContain('id="local-health">ok')
      expect(javascriptOutput(join(fixture, '.next/server'))).toContain('HULLA_NEXT_PRIVATE_DATABASE')
      expect(javascriptOutput(join(fixture, '.next/static/chunks'))).not.toContain('HULLA_NEXT_PRIVATE_DATABASE')

      running = await startFixture(
        process.execPath,
        (port) => [nextBin, 'start', fixture, '-p', String(port), '-H', '127.0.0.1'],
        fixture
      )
      const { origin } = running
      const count = async () => ((await (await fetch(`${origin}/probe`)).json()) as { calls: number }).calls
      expect(await count()).toBe(0)
      const pages = await Promise.all(
        ['ada', 'grace', 'ada', 'grace'].map(async (session) => {
          const response = await fetch(`${origin}/account`, { headers: { cookie: `session=${session}` } })
          expect(response.status).toBe(200)
          return response.text()
        })
      )
      pages.forEach((page, index) => expect(page).toContain(`id="viewer">${index % 2 === 0 ? 'Ada' : 'Grace'}`))
      expect(await count()).toBe(0)
      // Execute the same browser-safe client module against the real HTTP endpoint.
      await expect(createBrowserApi(origin).health()).resolves.toMatchObject({ status: 200, body: 'ok' })
      expect(await count()).toBe(1)
    } finally {
      await running?.stop()
      rmSync(fixture, { force: true, recursive: true })
    }
  }, 150_000)

  test.each(['local-client', 'server'])(
    'rejects a Client Component importing %s',
    (module) => {
      const fixture = fixtureDirectory()
      try {
        writeFileSync(
          join(fixture, 'app/refresh.tsx'),
          `
'use client'
import * as forbidden from '../${module}'
export function Refresh() { return <button onClick={() => console.log(forbidden)}>invalid import</button> }
`
        )
        const result = build(fixture)
        expect(result.status).not.toBe(0)
        expect(result.error).toBeUndefined()
        expect(`${result.stdout}\n${result.stderr}`).toMatch(/server-only/)
        expect(`${result.stdout}\n${result.stderr}`).toMatch(/Client Component|client component|use client/i)
      } finally {
        rmSync(fixture, { force: true, recursive: true })
      }
    },
    150_000
  )
})
