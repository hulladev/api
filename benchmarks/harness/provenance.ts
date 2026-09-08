import { createHash, randomUUID } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { arch, cpus, hostname, platform, release } from 'node:os'
import { relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const METHODOLOGY_VERSION = 4
const root = fileURLToPath(new URL('../../', import.meta.url))
async function sources(directory: string, built = false): Promise<string[]> {
  const files: string[] = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (['node_modules', 'results', ...(built ? [] : ['dist'])].includes(entry.name) || entry.name.startsWith('.'))
      continue
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) files.push(...(await sources(path, built)))
    else if (
      entry.name.endsWith('.ts') ||
      (built && /\.(?:js|mjs|cjs)$/.test(entry.name)) ||
      entry.name === 'package.json'
    )
      files.push(path)
  }
  return files
}
async function fingerprint(files: readonly string[], repository = root): Promise<string> {
  const hash = createHash('sha256')
  for (const path of [...files].sort())
    hash
      .update(relative(repository, path))
      .update('\0')
      .update(await readFile(path))
      .update('\0')
  return hash.digest('hex')
}
export async function productFingerprint(repository = root): Promise<string> {
  // Benchmarks import public built exports. Unbuilt source edits do not change the measured code.
  const packages = await sources(resolve(repository, 'packages'), true)
  return fingerprint(
    packages.filter((path) => path.includes('/dist/') || path.endsWith('/package.json')),
    repository
  )
}

export async function benchmarkIdentity(repository = root) {
  return {
    runId: process.env['BENCH_RUN_ID'] ?? randomUUID(),
    methodologyVersion: METHODOLOGY_VERSION,
    productFingerprint: await productFingerprint(repository),
    workloadFingerprint: await fingerprint(
      [
        ...(await sources(resolve(repository, 'benchmarks'))),
        resolve(repository, 'bun.lock'),
        resolve(repository, 'package.json'),
      ],
      repository
    ),
    environment: {
      architecture: arch(),
      cpu: cpus()[0]?.model ?? 'unknown',
      host: hostname(),
      osRelease: release(),
      platform: platform(),
      runtime: process.versions['bun'] === undefined ? `Node ${process.version}` : `Bun ${process.versions['bun']}`,
    },
  }
}
export type BenchmarkIdentity = Awaited<ReturnType<typeof benchmarkIdentity>>

export function compatibleIdentity(left: BenchmarkIdentity, right: BenchmarkIdentity, compareProduct = true): boolean {
  return (
    left.methodologyVersion === right.methodologyVersion &&
    left.workloadFingerprint === right.workloadFingerprint &&
    (!compareProduct || left.productFingerprint === right.productFingerprint) &&
    Object.keys(right.environment).every(
      (key) =>
        left.environment[key as keyof typeof left.environment] ===
        right.environment[key as keyof typeof right.environment]
    )
  )
}

export function assertCompatibleIdentity(left: BenchmarkIdentity, right: BenchmarkIdentity, label: string): void {
  if (compatibleIdentity(left, right)) return
  const changed = [
    ...(left.productFingerprint === right.productFingerprint ? [] : ['built packages']),
    ...(left.workloadFingerprint === right.workloadFingerprint ? [] : ['benchmark fixtures or dependencies']),
    ...(left.methodologyVersion === right.methodologyVersion ? [] : ['methodology']),
    ...Object.keys(left.environment)
      .filter(
        (key) =>
          left.environment[key as keyof typeof left.environment] !==
          right.environment[key as keyof typeof right.environment]
      )
      .map((key) => `environment.${key}`),
  ]
  throw new Error(
    `Benchmark inputs changed while measuring ${label}: ${changed.join(', ')}. Run bun run bench again after builds and benchmark edits finish.`
  )
}
