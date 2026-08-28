import { spawn, spawnSync } from 'node:child_process'
import { once } from 'node:events'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

const astroBin = fileURLToPath(new URL('../node_modules/astro/bin/astro.mjs', import.meta.url))
const fixtureSource = fileURLToPath(new URL('./fixtures/astro-app', import.meta.url))
const temporaryRoot = fileURLToPath(new URL('../.astro/test-fixtures', import.meta.url))

async function availablePort(): Promise<number> {
  const server = createServer()
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('Unable to allocate fixture port')
  const port = address.port
  server.close()
  await once(server, 'close')
  return port
}

async function waitForServer(origin: string, output: () => string): Promise<Response> {
  let failure: unknown
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      return await fetch(origin)
    } catch (error) {
      failure = error
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
  }
  throw new Error(`Astro fixture did not start:\n${output()}`, { cause: failure })
}

describe('Astro build integration', () => {
  test('runs an API endpoint and a server island using the same native-context implementation', async () => {
    mkdirSync(temporaryRoot, { recursive: true })
    const fixture = mkdtempSync(join(temporaryRoot, 'astro-app-'))
    cpSync(fixtureSource, fixture, { recursive: true })
    let server: ReturnType<typeof spawn> | undefined

    try {
      const result = spawnSync(process.execPath, [astroBin, 'build'], {
        cwd: fixture,
        encoding: 'utf8',
        timeout: 120_000,
      })

      expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0)

      const page = readFileSync(join(fixture, 'dist/client/index.html'), 'utf8')
      expect(page).toContain('/_server-islands/Status?')
      expect(page).toContain('server-island-fallback')

      const serverOutput = join(fixture, 'dist/server')
      const serverEntry = readFileSync(join(serverOutput, 'entry.mjs'), 'utf8')
      expect(serverEntry).toContain('/_server-islands/')
      expect(serverEntry).toContain('/api/[...hulla]')

      const port = await availablePort()
      let serverOutputText = ''
      server = spawn(process.execPath, [join(fixture, 'dist/server/entry.mjs')], {
        cwd: fixture,
        env: { ...process.env, HOST: '127.0.0.1', PORT: String(port) },
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      server.stdout?.on('data', (chunk) => {
        serverOutputText += String(chunk)
      })
      server.stderr?.on('data', (chunk) => {
        serverOutputText += String(chunk)
      })

      const origin = `http://127.0.0.1:${port}`
      const pageResponse = await waitForServer(origin, () => serverOutputText)
      expect(pageResponse.status).toBe(200)
      const renderedPage = await pageResponse.text()

      const apiResponse = await fetch(`${origin}/api/health`)
      expect(apiResponse.status).toBe(200)
      await expect(apiResponse.json()).resolves.toEqual({
        actor: 'Ada',
        requestPath: '/api/health',
        routePath: '/api/health',
      })

      const islandPath = renderedPage.match(/href="([^"]*\/_server-islands\/Status\?[^"]+)"/)?.[1]
      expect(islandPath).toBeDefined()
      const islandResponse = await fetch(`${origin}${islandPath!.replaceAll('&amp;', '&')}`, {
        headers: { referer: `${origin}/` },
      })
      expect(islandResponse.status).toBe(200)
      const island = await islandResponse.text()
      expect(island).toContain('id="server-island"')
      expect(island).toContain('data-request-path="/_server-islands/Status"')
      expect(island).toContain('data-route-path="/api/health"')
      expect(island).toContain('Ada')
    } finally {
      if (server !== undefined && server.exitCode === null) {
        server.kill('SIGTERM')
        await once(server, 'exit')
      }
      rmSync(fixture, { force: true, recursive: true })
    }
  }, 120_000)
})
