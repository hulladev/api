import assert from 'node:assert/strict'
import { mkdtemp, readFile, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { test } from 'node:test'
import { assertExistingPackage, main, orderPackages, registryVersion, waitForPublication } from './release.mjs'

test('dependencies and peers are published before adapters, independent of input order', () => {
  const packages = [
    { name: 'adapter', peerDependencies: { core: '^1.0.0' } },
    { name: 'core', dependencies: { transport: '^1.0.0' } },
    { name: 'transport' },
  ]
  assert.deepEqual(
    orderPackages(packages).map((pkg) => pkg.name),
    ['transport', 'core', 'adapter']
  )
  assert.throws(
    () =>
      orderPackages([
        { name: 'a', dependencies: { b: '*' } },
        { name: 'b', dependencies: { a: '*' } },
      ]),
    /dependency cycle/
  )
})

test('only a registry 404 means unpublished; auth failures and outages stop the release', async () => {
  assert.equal(await registryVersion('pkg', '1.0.0', async () => ({ status: 404 })), null)
  for (const status of [401, 403, 429, 500]) {
    await assert.rejects(
      registryVersion('pkg', '1.0.0', async () => ({ status, ok: false })),
      /Registry lookup failed/
    )
  }
  await assert.rejects(
    registryVersion('pkg', '1.0.0', async () => {
      throw new Error('offline')
    }),
    /offline/
  )
})

test('accepted publications can take several minutes to become visible, with a bounded wait', async () => {
  const pkg = { name: 'pkg', version: '1.0.0' }
  let lookups = 0
  const published = { ...pkg, dist: { integrity: 'sha512-expected' } }
  const visible = await waitForPublication(
    pkg,
    async () => (++lookups <= 45 ? { status: 404 } : { status: 200, ok: true, json: async () => published }),
    async () => {}
  )
  assert.deepEqual(visible, published)
  await assert.rejects(
    waitForPublication(
      pkg,
      async () => ({ status: 404 }),
      async () => {}
    ),
    /not visible after ten minutes.*Rerun this workflow to resume/
  )
})

test('retry accepts identical published bytes and rejects a conflicting existing version', () => {
  const expected = { name: 'pkg', version: '1.0.0', integrity: 'sha512-expected' }
  assert.doesNotThrow(() => assertExistingPackage(expected, { ...expected, dist: { integrity: expected.integrity } }))
  assert.throws(
    () => assertExistingPackage(expected, { ...expected, dist: { integrity: 'sha512-other' } }),
    /different bytes/
  )
})

test('version preparation keeps a family coordinated and mode never publishes an unprepared checkout', async () => {
  const previousCwd = process.cwd(),
    previousOutput = process.env.GITHUB_OUTPUT
  const previousFetch = globalThis.fetch
  const previousEvent = process.env.GITHUB_EVENT_NAME
  const previousAnnouncements = process.env.PUBLISH_GITHUB_RELEASES
  const root = await mkdtemp(path.join(tmpdir(), 'hulla-release-test-'))
  try {
    process.chdir(root)
    process.env.GITHUB_OUTPUT = path.join(root, 'output')
    await mkdir('.changeset')
    await mkdir('core')
    await mkdir('adapter')
    const save = (file, value) => writeFile(file, JSON.stringify(value))
    await save('.changeset/release.config.json', {
      repository: 'test/repo',
      packages: ['adapter', 'core'],
    })
    const core = { name: 'core', version: '1.1.0', repository: { url: 'https://github.com/test/repo.git' } }
    await save('core/package.json', core)
    await save('adapter/package.json', { ...core, name: 'adapter', peerDependencies: { core: '^1.0.0' } })
    await main('mode')
    assert.equal(await readFile('output', 'utf8'), 'mode=none\n')
    await writeFile('.changeset/fix.md', '---\n"adapter": patch\n---\nFix adapter.\n')
    await main('mode')
    assert.match(await readFile('output', 'utf8'), /mode=version/)
    await main('prepare')
    const plan = JSON.parse(await readFile('.changeset/release-plan.json', 'utf8'))
    assert.equal(plan.version, '1.1.0')
    assert.deepEqual(
      plan.packages.map((pkg) => pkg.name),
      ['core', 'adapter']
    )
    assert.equal(JSON.parse(await readFile('adapter/package.json', 'utf8')).peerDependencies.core, '^1.1.0')
    await rm('.changeset/fix.md')
    process.env.GITHUB_EVENT_NAME = 'push'
    globalThis.fetch = async (url) => {
      assert(url.startsWith('https://registry.npmjs.org/'), 'Release completion must not require a GitHub announcement')
      return { status: 200, ok: true, json: async () => ({}) }
    }
    await writeFile('output', '')
    await main('mode')
    assert.equal(await readFile('output', 'utf8'), 'mode=none\n')
    globalThis.fetch = async (url) => ({
      status: url.includes('/adapter/') ? 404 : 200,
      ok: true,
      json: async () => ({}),
    })
    await writeFile('output', '')
    await main('mode')
    assert.equal(await readFile('output', 'utf8'), 'mode=publish\n')
    globalThis.fetch = async () => ({ status: 200, ok: true, json: async () => ({}) })
    process.env.GITHUB_EVENT_NAME = 'workflow_dispatch'
    await writeFile('output', '')
    await main('mode')
    assert.equal(await readFile('output', 'utf8'), 'mode=publish\n')
    delete process.env.PUBLISH_GITHUB_RELEASES
    globalThis.fetch = async () => {
      throw new Error('Disabled announcements must not contact GitHub')
    }
    await assert.doesNotReject(main('announce'))
    await save('core/package.json', { ...core, version: '1.2.0' })
    await assert.rejects(main('prepare'), /coordinated version/)
    await save('core/package.json', core)
    await save('.changeset/pre.json', { mode: 'pre' })
    await assert.rejects(main('prepare'), /prerelease mode/)
  } finally {
    globalThis.fetch = previousFetch
    for (const [name, value] of [
      ['GITHUB_EVENT_NAME', previousEvent],
      ['PUBLISH_GITHUB_RELEASES', previousAnnouncements],
    ]) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
    process.chdir(previousCwd)
    if (previousOutput === undefined) delete process.env.GITHUB_OUTPUT
    else process.env.GITHUB_OUTPUT = previousOutput
    await rm(root, { recursive: true, force: true })
  }
})
