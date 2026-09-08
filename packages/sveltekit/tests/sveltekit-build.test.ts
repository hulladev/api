import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'
import { frameworkBuildEnv, javascriptOutput, startFixture } from '../../../scripts/framework-test-utils'

const viteBin = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url))
const fixtureSource = fileURLToPath(new URL('./fixtures/sveltekit-app', import.meta.url))
const temporaryRoot = fileURLToPath(new URL('../.svelte-kit/test-fixtures', import.meta.url))

function fixtureDirectory() {
  mkdirSync(temporaryRoot, { recursive: true })
  const fixture = mkdtempSync(join(temporaryRoot, 'sveltekit-app-'))
  cpSync(fixtureSource, fixture, { recursive: true })
  return fixture
}
function build(fixture: string) {
  return spawnSync(process.execPath, [viteBin, 'build'], {
    cwd: fixture,
    env: frameworkBuildEnv(),
    encoding: 'utf8',
    timeout: 120_000,
  })
}

describe('SvelteKit hybrid integration', () => {
  test('runs a local server loader and remote query with a separately exposed HTTP endpoint', async () => {
    const fixture = fixtureDirectory()
    let running: Awaited<ReturnType<typeof startFixture>> | undefined
    try {
      const result = build(fixture)
      expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0)
      expect(javascriptOutput(join(fixture, '.svelte-kit/output/server'))).toContain('HULLA_SVELTEKIT_PRIVATE_DATABASE')
      expect(javascriptOutput(join(fixture, '.svelte-kit/output/client'))).not.toContain(
        'HULLA_SVELTEKIT_PRIVATE_DATABASE'
      )
      running = await startFixture(
        process.execPath,
        (port) => [viteBin, 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
        fixture
      )
      const page = await fetch(running.origin)
      expect(page.status).toBe(200)
      const html = await page.text()
      expect(html).toMatch(/id="local-health">(?:<!--.*?-->)*ok/)
      expect(html).toContain('SvelteKit fixture:')
      const response = await fetch(`${running.origin}/api/health`)
      expect(response.status).toBe(200)
      expect(await response.text()).toBe('ok')
    } finally {
      await running?.stop()
      rmSync(fixture, { force: true, recursive: true })
    }
  }, 150_000)

  test('rejects a component importing the local server client', () => {
    const fixture = fixtureDirectory()
    try {
      writeFileSync(
        join(fixture, 'src/routes/+page.svelte'),
        `
<script>
import { api } from '$lib/server/client'
</script>
<button onclick={() => api.health()}>invalid import</button>
`
      )
      const result = build(fixture)
      expect(result.status).not.toBe(0)
      expect(result.error).toBeUndefined()
      expect(`${result.stdout}\n${result.stderr}`).toMatch(/(?:Cannot import|server-only|server module)/i)
      expect(`${result.stdout}\n${result.stderr}`).toContain('server/client')
    } finally {
      rmSync(fixture, { force: true, recursive: true })
    }
  }, 150_000)
})
