import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { access, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises'
import { isBuiltin } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import ts from 'typescript-api'

const root = fileURLToPath(new URL('..', import.meta.url))
const exec = promisify(execFile)
type Manifest = {
  name: string
  version: string
  private?: boolean
  exports: Record<string, { types: string; import: string }>
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
}
type Profile = { package: string; peers: Record<string, string> }
const profiles: Record<string, Profile> = {
  'nestjs-11': {
    package: 'nestjs',
    peers: {
      '@nestjs/common': '^11.1.0',
      '@nestjs/core': '^11.1.0',
      '@nestjs/platform-express': '^11.1.0',
      '@nestjs/platform-fastify': '^11.1.0',
    },
  },
  'nestjs-12': {
    package: 'nestjs',
    peers: {
      '@nestjs/common': '^12.0.1',
      '@nestjs/core': '^12.0.1',
      '@nestjs/platform-express': '^12.0.1',
      '@nestjs/platform-fastify': '^12.0.1',
    },
  },
  'express-4': { package: 'express', peers: { express: '4.18.0', '@types/express': '4.17.25' } },
  'express-5': { package: 'express', peers: { express: '^5.0.0', '@types/express': '^5.0.0' } },
  'next-15': { package: 'next', peers: { next: '^15.0.0' } },
  'next-16': { package: 'next', peers: { next: '^16.0.0' } },
  'nuxt-3': { package: 'nuxt', peers: { nuxt: '^3.0.0' } },
  'nuxt-4': { package: 'nuxt', peers: { nuxt: '^4.0.0' } },
  'astro-5': { package: 'astro', peers: { astro: '^5.0.0' } },
  'astro-6': { package: 'astro', peers: { astro: '^6.0.0' } },
  'astro-7': { package: 'astro', peers: { astro: '^7.0.0' } },
  'netlify-4': { package: 'netlify-functions', peers: { '@netlify/functions': '^4.0.0' } },
  'netlify-5': { package: 'netlify-functions', peers: { '@netlify/functions': '^5.0.0' } },
}
if (process.argv.includes('--matrix')) {
  console.log(
    JSON.stringify({
      include: Object.entries(profiles).map(([profile, value]) => ({
        profile,
        package: `@hulla/api-${value.package}`,
      })),
    })
  )
  process.exit(0)
}
const profileName = process.argv.find((argument) => argument.startsWith('--profile='))?.slice('--profile='.length)
const profile = profileName === undefined ? undefined : profiles[profileName]
assert(profileName === undefined || profile, `Unknown compatibility profile: ${profileName}`)
const selected =
  process.argv.find((argument) => argument.startsWith('--package='))?.slice('--package='.length) ?? profile?.package

async function command(binary: string, args: string[], cwd: string): Promise<string> {
  try {
    const result = await exec(binary, args, {
      cwd,
      timeout: 180_000,
      maxBuffer: 8 * 1024 * 1024,
      env: { ...process.env, NODE_PATH: '' },
    })
    return result.stdout
  } catch (error) {
    const failure = error as Error & { stdout?: string; stderr?: string }
    throw new Error(`${binary} ${args.join(' ')} failed in ${cwd}\n${failure.stdout ?? ''}\n${failure.stderr ?? ''}`, {
      cause: error,
    })
  }
}
const manifest = async (directory: string): Promise<Manifest> =>
  JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'))
// Audit every emitted JS/declaration file, including chunks that aren't public entrypoints.
// A transitive peer's dependency must not silently become this package's public dependency.
async function checkPublishedImports(directory: string, pkg: Manifest, resolveTypes = false): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      await checkPublishedImports(path, pkg, resolveTypes)
      continue
    }
    if (!/\.(?:[cm]?js|d\.[cm]?ts)$/.test(entry.name)) continue
    const source = await readFile(path, 'utf8')
    for (const imported of ts.preProcessFile(source, true, true).importedFiles) {
      const specifier = imported.fileName
      if (isBuiltin(specifier)) continue
      if (resolveTypes && entry.name.includes('.d.')) {
        const resolution = ts.resolveModuleName(
          specifier,
          path,
          { moduleResolution: ts.ModuleResolutionKind.Bundler },
          ts.sys
        )
        assert(
          resolution.resolvedModule,
          `${pkg.name}: ${entry.name} cannot resolve published type import ${specifier}`
        )
      }
      if (specifier.startsWith('.')) continue
      if (pkg.name === '@hulla/api-sveltekit' && specifier === '$app/server') continue
      const dependency = specifier.startsWith('@')
        ? specifier.split('/').slice(0, 2).join('/')
        : specifier.split('/')[0]!
      const typesPackage = `@types/${dependency.replace(/^@/, '').replace('/', '__')}`
      const declaredTypes =
        entry.name.includes('.d.') && (pkg.dependencies?.[typesPackage] || pkg.peerDependencies?.[typesPackage])
      assert(
        dependency === pkg.name ||
          pkg.dependencies?.[dependency] ||
          pkg.peerDependencies?.[dependency] ||
          declaredTypes,
        `${pkg.name}: ${entry.name} imports undeclared dependency ${specifier}`
      )
    }
  }
}
const scratch = await mkdtemp(join(tmpdir(), 'hulla-package-consumers-'))
try {
  const packages = (await readdir(join(root, 'packages'))).sort()
  for (const name of packages) {
    const pkg = await manifest(join(root, 'packages', name))
    for (const [peer, range] of Object.entries(pkg.peerDependencies ?? {})) {
      if (!range.includes('||')) continue
      for (const branch of range.split('||')) {
        const major = branch.match(/(\d+)\./)?.[1]
        assert(
          major &&
            Object.values(profiles).some(
              (candidate) => candidate.package === name && candidate.peers[peer]?.match(/(\d+)\./)?.[1] === major
            ),
          `${pkg.name}: missing compatibility profile for ${peer} ${branch.trim()}`
        )
      }
    }
  }
  assert(selected === undefined || packages.includes(selected), `Unknown package: ${selected}`)
  const manifests = new Map(
    await Promise.all(packages.map(async (name) => [name, await manifest(join(root, 'packages', name))] as const))
  )
  const packageNames = new Map([...manifests].map(([name, pkg]) => [pkg.name, name]))
  function localDependencies(name: string, result = new Set<string>()): Set<string> {
    for (const dependency of Object.keys(manifests.get(name)?.dependencies ?? {})) {
      const local = packageNames.get(dependency)
      if (local === undefined || result.has(local)) continue
      result.add(local)
      localDependencies(local, result)
    }
    return result
  }
  const toPack = new Set(['core', ...packages.filter((name) => selected === undefined || name === selected)])
  for (const name of toPack) for (const dependency of localDependencies(name)) toPack.add(dependency)
  const archives = new Map<string, string>()
  for (const name of toPack) {
    const directory = join(root, 'packages', name)
    const pkg = await manifest(directory)
    if (pkg.private) continue
    await checkPublishedImports(join(directory, 'dist'), pkg)
    for (const entry of Object.values(pkg.exports)) {
      await access(join(directory, entry.import))
      await access(join(directory, entry.types))
    }
    const archive = join(scratch, `${name}.tgz`)
    await command('bun', ['pm', 'pack', '--ignore-scripts', '--quiet', '--filename', archive], directory)
    archives.set(name, archive)
  }
  for (const name of packages.filter((name) => selected === undefined || name === selected)) {
    if (!archives.has(name)) continue
    console.log(`Checking packed ${name}${profileName ? ` (${profileName})` : ''}…`)
    const directory = join(root, 'packages', name)
    const pkg = await manifest(directory)
    const consumer = join(scratch, name)
    await mkdir(consumer)
    const dependencies: Record<string, string> = {
      '@hulla/api': `file:${archives.get('core')!}`,
      [pkg.name]: `file:${archives.get(name)!}`,
    }
    const overrides: Record<string, string> = {}
    // Resolve declared workspace dependencies to tarballs before they are published.
    for (const dependency of localDependencies(name)) {
      overrides[manifests.get(dependency)!.name] = `file:${archives.get(dependency)!}`
    }
    // Only declared dependencies, peers, and the consumer type environment are installed.
    // Unrelated sibling packages and workspace dev dependencies cannot mask omissions.
    for (const [peer, range] of Object.entries(pkg.peerDependencies ?? {})) {
      if (peer === '@hulla/api') continue
      const installed = await manifest(join(directory, 'node_modules', peer))
      dependencies[peer] = profile?.peers[peer] ?? installed.version ?? range
    }
    const fixtureHosts =
      name === 'nestjs'
        ? ['@nestjs/platform-express', '@nestjs/platform-fastify']
        : name === 'websocket'
          ? ['ws', '@types/ws']
          : []
    for (const host of fixtureHosts) {
      const installed = await manifest(join(directory, 'node_modules', host))
      dependencies[host] = profile?.peers[host] ?? installed.version
    }
    if (name === 'nuxt') dependencies['h3'] = pkg.dependencies!['h3']!
    const nodeTypes = await manifest(join(root, 'node_modules/@types/node'))
    dependencies['@types/node'] ??= nodeTypes.version
    await writeFile(
      join(consumer, 'package.json'),
      JSON.stringify({ name: 'isolated-consumer', private: true, type: 'module', dependencies, overrides })
    )
    await command('bun', ['install', '--ignore-scripts'], consumer)
    for (const [peer, requested] of Object.entries(profile?.peers ?? {})) {
      const actual = await manifest(join(consumer, 'node_modules', peer))
      assert.equal(actual.version.split('.')[0], requested.match(/(\d+)\./)?.[1], `Wrong host major for ${peer}`)
      if (/^\d+\.\d+\.\d+$/.test(requested)) assert.equal(actual.version, requested)
      console.log(`  ${peer}@${actual.version}`)
    }
    // Confirm this is an extracted tarball, not a workspace symlink.
    assert((await realpath(join(consumer, 'node_modules', pkg.name))).startsWith(await realpath(consumer)))
    await checkPublishedImports(join(consumer, 'node_modules', pkg.name, 'dist'), pkg, true)
    const entrypoints = Object.keys(pkg.exports).map((key) => pkg.name + (key === '.' ? '' : key.slice(1)))
    await writeFile(
      join(consumer, 'exports.ts'),
      entrypoints.map((entry, index) => `export * as surface${index} from ${JSON.stringify(entry)};`).join('\n')
    )
    const fixturePath = join(root, 'scripts/package-consumers', `${name}.ts`)
    try {
      await writeFile(join(consumer, 'fixture.ts'), await readFile(fixturePath, 'utf8'))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    await writeFile(
      join(consumer, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          target: 'ES2023',
          module: 'ESNext',
          moduleResolution: 'Bundler',
          strict: true,
          skipLibCheck: true,
          declaration: true,
          outDir: 'dist',
          types: ['node'],
        },
        include: ['*.ts'],
      })
    )
    await command('node', [join(root, 'node_modules/typescript/bin/tsc'), '-p', 'tsconfig.json'], consumer)
    // SvelteKit resolves this virtual import only inside its production build fixture.
    const runtimeEntries = entrypoints.filter((entry) => entry !== '@hulla/api-sveltekit/remote')
    const verify = `import assert from 'node:assert/strict';
import { defineContract, response, route } from '@hulla/api';
import { defineClient } from '@hulla/api/client';
import { defineServer } from '@hulla/api/server';
import { fetchAdapter, fetchTransport } from '@hulla/api/fetch';
for (const entry of ${JSON.stringify(runtimeEntries)}) assert(Object.keys(await import(entry)).length > 0, entry);
const contract = defineContract({ routes: { health: route.get('/health', { responses: { 200: response.text() } }) } });
const implementation = defineServer(contract).implement({ health: () => ({ status: 200, body: 'ok' }) });
const client = defineClient(contract, { transport: fetchTransport({ baseUrl: 'http://consumer.test', fetch: fetchAdapter().mount(implementation) }) });
assert.equal((await client.health()).body, 'ok');
`
    await writeFile(join(consumer, 'verify.mjs'), verify)
    await command('node', ['verify.mjs'], consumer)
    try {
      await access(join(consumer, 'dist/fixture.js'))
      await command('node', ['dist/fixture.js'], consumer)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    console.log(
      `Verified ${pkg.name}: ${entrypoints.length} declaration surfaces, ${runtimeEntries.length} runtime imports, isolated roundtrip`
    )
  }
} finally {
  await rm(scratch, { recursive: true, force: true })
}
