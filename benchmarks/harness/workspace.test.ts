import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { benchmarkIdentity, compatibleIdentity } from './provenance'
import { createBenchmarkWorkspace } from './workspace'

test('isolates builds and fixtures and remaps workspace dependencies while preserving report output', async () => {
  const root = await mkdtemp(join(tmpdir(), 'bench-live-'))
  let snapshot: string | undefined
  try {
    await mkdir(join(root, 'packages/core/dist'), { recursive: true })
    await mkdir(join(root, 'benchmarks/node_modules/@hulla'), { recursive: true })
    await writeFile(join(root, 'package.json'), '{}')
    await writeFile(join(root, 'bun.lock'), '{}')
    await writeFile(join(root, 'packages/core/package.json'), '{}')
    await writeFile(join(root, 'packages/core/dist/index.js'), 'export const version = 1')
    await writeFile(join(root, 'benchmarks/fixture.ts'), 'export const value = 1')
    await symlink(join(root, 'packages/core'), join(root, 'benchmarks/node_modules/@hulla/api'))
    await symlink(join(root, 'packages/removed'), join(root, 'benchmarks/node_modules/@hulla/removed'))
    const before = await benchmarkIdentity(root)
    snapshot = await createBenchmarkWorkspace(root)
    expect(compatibleIdentity(before, await benchmarkIdentity(snapshot))).toBe(true)
    expect(await realpath(join(snapshot, 'benchmarks/node_modules/@hulla/api'))).toBe(
      await realpath(join(snapshot, 'packages/core'))
    )
    await writeFile(join(root, 'packages/core/dist/index.js'), 'export const version = 2')
    await writeFile(join(root, 'benchmarks/fixture.ts'), 'export const value = 2')
    expect(compatibleIdentity(before, await benchmarkIdentity(root))).toBe(false)
    expect(compatibleIdentity(before, await benchmarkIdentity(snapshot))).toBe(true)
    await writeFile(join(snapshot, 'benchmarks/results/latest.md'), 'measured report')
    expect(await readFile(join(root, 'benchmarks/results/latest.md'), 'utf8')).toBe('measured report')
  } finally {
    if (snapshot !== undefined) await rm(snapshot, { recursive: true, force: true })
    await rm(root, { recursive: true, force: true })
  }
})
