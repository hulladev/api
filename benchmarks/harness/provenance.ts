import { createHash, randomUUID } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { arch, cpus, hostname, platform, release } from 'node:os'
import { relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const METHODOLOGY_VERSION = 3
const root = fileURLToPath(new URL('../../', import.meta.url))
async function sources(directory: string): Promise<string[]> {
  const files: string[] = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (['dist', 'node_modules', 'results'].includes(entry.name) || entry.name.startsWith('.')) continue
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) files.push(...(await sources(path)))
    else if (entry.name.endsWith('.ts') || entry.name === 'package.json') files.push(path)
  }
  return files
}
async function fingerprint(files: readonly string[]): Promise<string> {
  const hash = createHash('sha256')
  for (const path of [...files].sort())
    hash
      .update(relative(root, path))
      .update('\0')
      .update(await readFile(path))
      .update('\0')
  return hash.digest('hex')
}
export async function benchmarkIdentity() {
  const packages = await sources(resolve(root, 'packages'))
  const product = packages.filter((path) => path.includes('/src/') || path.endsWith('/package.json'))
  return {
    runId: process.env['BENCH_RUN_ID'] ?? randomUUID(),
    methodologyVersion: METHODOLOGY_VERSION,
    productFingerprint: await fingerprint(product),
    workloadFingerprint: await fingerprint([
      ...(await sources(resolve(root, 'benchmarks'))),
      resolve(root, 'bun.lock'),
      resolve(root, 'package.json'),
    ]),
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
