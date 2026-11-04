// Shared release lifecycle. Keep this file in sync across the package repositories.
// Node is intentional: this script also runs in npm-only publish/verification jobs.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import console from 'node:console'
import { createHash } from 'node:crypto'
import { access, appendFile, cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { setTimeout } from 'node:timers/promises'
import { pathToFileURL } from 'node:url'

const json = async (file) => JSON.parse(await readFile(file, 'utf8'))
const save = (file, value) => writeFile(file, `${JSON.stringify(value, null, 2)}\n`)
const stable = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
const registry = 'https://registry.npmjs.org'
const integrity = (bytes) => `sha512-${createHash('sha512').update(bytes).digest('base64')}`
const run = (command, args, cwd = process.cwd()) =>
  execFileSync(command, args, { cwd, stdio: 'inherit', env: { ...process.env, HUSKY: '0' } })

export function orderPackages(packages) {
  const byName = new Map(packages.map((pkg) => [pkg.name, pkg]))
  const visiting = new Set()
  const done = new Set()
  const result = []
  function visit(pkg) {
    if (done.has(pkg.name)) return
    assert(!visiting.has(pkg.name), `Release dependency cycle: ${pkg.name}`)
    visiting.add(pkg.name)
    for (const name of Object.keys({ ...pkg.dependencies, ...pkg.optionalDependencies, ...pkg.peerDependencies })) {
      if (byName.has(name)) visit(byName.get(name))
    }
    visiting.delete(pkg.name)
    done.add(pkg.name)
    result.push(pkg)
  }
  for (const pkg of packages) visit(pkg)
  return result
}

export async function registryVersion(name, version, request = globalThis.fetch) {
  const response = await request(`${registry}/${encodeURIComponent(name)}/${version}`, {
    signal: globalThis.AbortSignal.timeout(30_000),
    headers: { 'cache-control': 'no-cache' },
  })
  if (response.status === 404) return null
  assert(response.ok, `Registry lookup failed for ${name}@${version}: HTTP ${response.status}`)
  return response.json()
}

export async function waitForPublication(pkg, request = globalThis.fetch, wait = setTimeout) {
  for (let attempt = 0; attempt < 120; attempt++) {
    const visible = await registryVersion(pkg.name, pkg.version, request)
    if (visible) {
      const response = await request(`${registry}/${encodeURIComponent(pkg.name)}`, {
        signal: globalThis.AbortSignal.timeout(30_000),
        headers: { accept: 'application/vnd.npm.install-v1+json', 'cache-control': 'no-cache' },
      })
      if (response.status !== 404) {
        assert(response.ok, `Registry install metadata failed for ${pkg.name}: HTTP ${response.status}`)
        const metadata = await response.json()
        const installable = metadata.versions?.[pkg.version]
        if (installable) {
          assertExistingPackage({ ...pkg, integrity: visible.dist?.integrity }, installable)
          return visible
        }
      }
    }
    if (attempt < 119) await wait(5000)
  }
  assert.fail(`Publication not visible after ten minutes: ${pkg.name}@${pkg.version}. Rerun this workflow to resume.`)
}

export function assertExistingPackage(expected, actual) {
  assert.equal(actual.name, expected.name)
  assert.equal(actual.version, expected.version)
  assert.equal(
    actual.dist?.integrity,
    expected.integrity,
    `${expected.name}@${expected.version} exists with different bytes. Never overwrite or silently skip a conflicting release.`
  )
}

async function sourcePackages(config) {
  const packages = await Promise.all(
    config.packages.map(async (directory) => ({
      ...(await json(path.join(directory, 'package.json'))),
      directory,
    }))
  )
  assert(packages.length > 0, 'No release packages configured')
  for (const pkg of packages) {
    assert(!pkg.private, `${pkg.name} is private`)
    assert(stable.test(pkg.version), `Stable version required: ${pkg.name}@${pkg.version}`)
    assert.equal(
      pkg.repository?.url.replace(/^git\+/, '').replace(/\.git$/, ''),
      `https://github.com/${config.repository}`,
      `Incorrect repository.url: ${pkg.name}`
    )
  }
  assert.equal(
    new Set(packages.map((pkg) => pkg.version)).size,
    1,
    'This release family must have one coordinated version. Run changeset version first.'
  )
  return orderPackages(packages)
}

async function readPlan(config) {
  const plan = await json('.changeset/release-plan.json')
  assert.equal(plan.repository, config.repository)
  const packages = await sourcePackages(config)
  assert.deepEqual(
    plan.packages,
    packages.map(({ name, version, directory }) => ({ name, version, directory })),
    'Release plan differs from package.json. Prepare and review a new release PR.'
  )
  assert.equal(plan.version, packages[0].version)
  assert.equal(plan.tag, `v${plan.version}`)
  await assertNoPrerelease()
  return plan
}

async function assertNoPrerelease() {
  assert(!(await exists('.changeset/pre.json')), 'Exit Changesets prerelease mode before publishing to latest')
}

async function exists(file) {
  try {
    await access(file)
    return true
  } catch (error) {
    if (error.code === 'ENOENT') return false
    throw error
  }
}

async function prepare(config) {
  await assertNoPrerelease()
  const packages = await sourcePackages(config)
  const names = new Set(packages.map((pkg) => pkg.name))
  // A family always advertises its current coordinated version, even when an old
  // peer range would technically still include the new version.
  for (const pkg of packages) {
    const file = path.join(pkg.directory, 'package.json')
    const manifest = await json(file)
    for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
      for (const [name, range] of Object.entries(manifest[field] ?? {})) {
        if (names.has(name)) manifest[field][name] = range.startsWith('workspace:') ? 'workspace:^' : `^${pkg.version}`
      }
    }
    await save(file, manifest)
  }
  await save('.changeset/release-plan.json', {
    repository: config.repository,
    version: packages[0].version,
    tag: `v${packages[0].version}`,
    packages: packages.map(({ name, version, directory }) => ({ name, version, directory })),
  })
  console.log('Prepared .changeset/release-plan.json. Review it with the version and changelog changes.')
}

async function mode(config) {
  const changesets = (await readdir('.changeset')).filter((name) => name.endsWith('.md') && name !== 'README.md')
  const pending = await Promise.all(changesets.map((name) => readFile(path.join('.changeset', name), 'utf8')))
  let value = 'none'
  if (pending.some((text) => /^---\r?\n[\s\S]*?:\s*(patch|minor|major)\s*\r?$/m.test(text.split(/\r?\n---/)[0]))) {
    value = 'version'
  } else if (await exists('.changeset/release-plan.json')) {
    const plan = await readPlan(config)
    const published = await Promise.all(plan.packages.map((pkg) => registryVersion(pkg.name, pkg.version)))
    // npm publication does not depend on creating a public GitHub announcement.
    // Manual runs can resume verification after every upload has completed.
    if (published.some((pkg) => pkg === null) || process.env.GITHUB_EVENT_NAME === 'workflow_dispatch')
      value = 'publish'
  }
  console.log(`Release mode: ${value}`)
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `mode=${value}\n`)
}

async function pack(config) {
  const plan = await readPlan(config)
  const source = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  await mkdir('.release', { recursive: true })
  const artifacts = []
  for (const pkg of plan.packages) {
    const archive = `${pkg.name.replace('@', '').replace('/', '-')}-${pkg.version}.tgz`
    const destination = path.resolve('.release', archive)
    if (config.stagedArchives) {
      await cp(path.join(config.stagedArchives, pkg.version, archive), destination)
    } else if (config.packageManager === 'bun') {
      run('bun', ['pm', 'pack', '--ignore-scripts', '--filename', destination], path.resolve(pkg.directory))
    } else {
      run('pnpm', ['--dir', pkg.directory, 'pack', '--pack-destination', path.resolve('.release')])
    }
    // Inspect the actual archive, rather than trusting source package metadata.
    const manifest = JSON.parse(
      execFileSync('tar', ['-xOf', destination, 'package/package.json'], { encoding: 'utf8' })
    )
    assert.equal(manifest.name, pkg.name)
    assert.equal(manifest.version, pkg.version)
    for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
      for (const range of Object.values(manifest[field] ?? {})) {
        assert(!/^(workspace:|file:|link:)/.test(range), `Unresolved ${field} in ${archive}: ${range}`)
      }
    }
    artifacts.push({ ...pkg, archive, integrity: integrity(await readFile(destination)) })
  }
  await save('.release/manifest.json', { ...plan, source, packages: artifacts })
  console.log(`Packed ${artifacts.length} packages from ${source}.`)
}

async function artifacts(config) {
  const manifest = await json('.release/manifest.json')
  assert.equal(manifest.repository, config.repository)
  assert.match(manifest.source, /^[0-9a-f]{40}$/)
  if (process.env.GITHUB_SHA) assert.equal(manifest.source, process.env.GITHUB_SHA)
  const plan = await readPlan(config)
  assert.equal(manifest.version, plan.version)
  assert.equal(manifest.tag, plan.tag)
  assert.deepEqual(
    manifest.packages.map(({ name, version, directory }) => ({ name, version, directory })),
    plan.packages
  )
  for (const pkg of manifest.packages) {
    assert.equal(path.basename(pkg.archive), pkg.archive)
    assert.equal(
      integrity(await readFile(path.join('.release', pkg.archive))),
      pkg.integrity,
      `Changed release artifact: ${pkg.archive}`
    )
  }
  return manifest
}

async function publish(config) {
  assert.equal(
    process.env.GITHUB_ACTIONS,
    'true',
    'Publish through the release workflow, not an interactive npm session'
  )
  assert(process.env.ACTIONS_ID_TOKEN_REQUEST_URL, 'Trusted publishing OIDC is unavailable')
  const manifest = await artifacts(config)
  for (const pkg of manifest.packages) {
    const existing = await registryVersion(pkg.name, pkg.version)
    if (existing) {
      assertExistingPackage(pkg, existing)
      console.log(`Already published, verified: ${pkg.name}@${pkg.version}`)
      continue
    }
    const latest = await registryVersion(pkg.name, 'latest')
    if (latest && stable.test(latest.version)) {
      const a = pkg.version.split('.').map(Number),
        b = latest.version.split('.').map(Number)
      const difference = a.findIndex((part, index) => part !== b[index])
      assert(
        difference >= 0 && a[difference] > b[difference],
        `Refusing to move latest backwards: ${pkg.name}@${latest.version}`
      )
    }
    run('npm', [
      'publish',
      path.resolve('.release', pkg.archive),
      '--ignore-scripts',
      '--access',
      'public',
      '--tag',
      'latest',
    ])
  }
  // Upload the family first; registry processing can overlap across packages.
  for (const pkg of manifest.packages) {
    console.log(`Waiting for npm visibility: ${pkg.name}@${pkg.version}`)
    const visible = await waitForPublication(pkg)
    assertExistingPackage(pkg, visible)
  }
}

async function verify(config) {
  const manifest = await artifacts(config)
  for (const pkg of manifest.packages) {
    const published = await waitForPublication(pkg)
    assert(published, `${pkg.name}@${pkg.version} is missing from npm`)
    assertExistingPackage(pkg, published)
  }
  const consumer = await mkdtemp(path.join(tmpdir(), 'hulla-published-consumer-'))
  try {
    await save(path.join(consumer, 'package.json'), { private: true, type: 'module' })
    run(
      'npm',
      [
        'install',
        '--ignore-scripts',
        '--prefer-online',
        '--legacy-peer-deps',
        '--no-audit',
        '--no-fund',
        '--no-package-lock',
        '--cache',
        path.join(consumer, '.npm-cache'),
        ...manifest.packages.map((pkg) => `${pkg.name}@${pkg.version}`),
        ...config.smokeDependencies,
      ],
      consumer
    )
    for (const pkg of manifest.packages) {
      const directory = path.join(consumer, 'node_modules', pkg.name)
      const installed = await json(path.join(directory, 'package.json'))
      assert.equal(installed.version, pkg.version)
      async function checkTargets(value) {
        if (typeof value === 'string' && value.startsWith('./') && !value.includes('*'))
          await access(path.join(directory, value))
        else if (value && typeof value === 'object') for (const item of Object.values(value)) await checkTargets(item)
      }
      await checkTargets(installed.exports)
      for (const field of ['main', 'module', 'types'])
        if (installed[field]) await access(path.join(directory, installed[field]))
      for (const target of Object.values(
        typeof installed.bin === 'string' ? { bin: installed.bin } : (installed.bin ?? {})
      )) {
        await access(path.join(directory, target))
      }
    }
    await writeFile(
      path.join(consumer, 'smoke.mjs'),
      config.smokeImports.map((name) => `await import(${JSON.stringify(name)});`).join('\n')
    )
    const runtime = config.smokeRuntime ?? 'node'
    assert(['node', 'bun'].includes(runtime), 'Unsupported smoke runtime')
    run(runtime, ['smoke.mjs'], consumer)
    console.log(
      `Fresh registry installation, entrypoints and runtime smoke imports passed for ${manifest.packages.length} packages.`
    )
  } finally {
    await rm(consumer, { recursive: true, force: true })
  }
}

function github(config, suffix, options = {}) {
  return globalThis.fetch(`https://api.github.com/repos/${config.repository}${suffix}`, {
    ...options,
    signal: globalThis.AbortSignal.timeout(30_000),
    headers: {
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      ...(process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
      ...options.headers,
    },
  })
}

export async function ensureGitTag(config, manifest, request = github) {
  const ref = `/git/ref/tags/${encodeURIComponent(manifest.tag)}`
  const existing = await request(config, ref)
  if (existing.ok) {
    const data = await existing.json()
    assert.equal(data.object?.type, 'commit', 'Release tag must point directly to its source commit')
    assert.equal(data.object?.sha, manifest.source, `Refusing to move existing tag ${manifest.tag}`)
    console.log(`Git tag ${manifest.tag} already points to the verified source.`)
    return
  }
  assert.equal(existing.status, 404, `Git tag lookup failed: HTTP ${existing.status}`)
  const response = await request(config, '/git/refs', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ref: `refs/tags/${manifest.tag}`, sha: manifest.source }),
  })
  assert(response.ok, `Git tag creation failed: HTTP ${response.status}`)
  console.log(`Created Git tag ${manifest.tag}; no GitHub Release announcement.`)
}

async function tag(config) {
  const manifest = await artifacts(config)
  assert(process.env.GITHUB_TOKEN, 'Git tag creation requires GITHUB_TOKEN')
  for (const pkg of manifest.packages) assertExistingPackage(pkg, await registryVersion(pkg.name, pkg.version))
  await ensureGitTag(config, manifest)
}

async function announce(config) {
  if (process.env.PUBLISH_GITHUB_RELEASES !== 'true') {
    console.log('GitHub Release announcements are disabled.')
    return
  }
  const manifest = await artifacts(config)
  assert(process.env.GITHUB_TOKEN, 'GitHub release creation requires GITHUB_TOKEN')
  for (const pkg of manifest.packages) assertExistingPackage(pkg, await registryVersion(pkg.name, pkg.version))
  const existing = await github(config, `/releases/tags/${encodeURIComponent(manifest.tag)}`)
  if (existing.ok) {
    console.log(`GitHub Release ${manifest.tag} already exists; no duplicate notification.`)
    return
  }
  assert.equal(existing.status, 404, `GitHub release lookup failed: ${existing.status}`)
  const notes = []
  for (const pkg of manifest.packages) {
    const file = path.join(pkg.directory, 'CHANGELOG.md')
    if (await exists(file)) {
      const sections = (await readFile(file, 'utf8')).split(/^## /m)
      const section = sections.find((text) => text.split('\n')[0].trim() === pkg.version)
      if (section) notes.push(`### ${pkg.name}\n\n${section.slice(section.indexOf('\n') + 1).trim()}`)
    }
  }
  const response = await github(config, '/releases', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      tag_name: manifest.tag,
      target_commitish: manifest.source,
      name: `${config.title} ${manifest.version}`,
      draft: false,
      prerelease: false,
      make_latest: 'true',
      body: [
        `Published and verified on npm:\n\n${manifest.packages.map((pkg) => `- [${pkg.name}@${pkg.version}](https://www.npmjs.com/package/${pkg.name}/v/${pkg.version})`).join('\n')}`,
        ...notes,
      ].join('\n\n'),
    }),
  })
  assert(response.ok, `GitHub release creation failed: HTTP ${response.status}: ${await response.text()}`)
  console.log(`Published GitHub Release ${manifest.tag}.`)
}

export async function main(command) {
  const config = await json('.changeset/release.config.json')
  const commands = { mode, prepare, pack, publish, verify, tag, announce }
  assert(commands[command], `Usage: node scripts/release.mjs ${Object.keys(commands).join('|')}`)
  await commands[command](config)
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await main(process.argv[2])
}
