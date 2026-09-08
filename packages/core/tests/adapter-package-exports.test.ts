import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

type PackageManifest = {
  readonly exports: Readonly<Record<string, unknown>>
}

const packages = fileURLToPath(new URL('../../', import.meta.url))

async function exportPaths(name: string): Promise<readonly string[]> {
  const manifest = JSON.parse(await readFile(`${packages}/${name}/package.json`, 'utf8')) as PackageManifest
  return Object.keys(manifest.exports)
}

describe('adapter package exports', () => {
  test('uses the root for integrations with one runtime surface', async () => {
    for (const name of [
      'astro',
      'aws-lambda',
      'azure-functions',
      'elysia',
      'express',
      'fastify',
      'google-cloud-functions',
      'h3',
      'hono',
      'koa',
      'netlify-functions',
      'node-http',
      'nestjs',
      'websocket',
      'react-router',
      'solid-start',
      'tanstack-start',
    ]) {
      await expect(exportPaths(name)).resolves.toEqual(['.'])
    }
  })

  test('keeps packages with distinct runtime surfaces split', async () => {
    await expect(exportPaths('message-port')).resolves.toEqual(['.', './desktop', './electron', './tauri', './dioxus'])
    await expect(exportPaths('cloudflare')).resolves.toEqual(['.', './pages'])
    await expect(exportPaths('next')).resolves.toEqual(['./client', './server'])
    await expect(exportPaths('nuxt')).resolves.toEqual(['./client', './server'])
    await expect(exportPaths('sveltekit')).resolves.toEqual(['./server', './remote'])
  })
})
