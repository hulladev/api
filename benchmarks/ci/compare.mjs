import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { cpus } from 'node:os'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderReport } from './report.mjs'

const [headRoot, baseRoot, outputDirectory] = process.argv.slice(2).map((value) => resolve(value))
if (!headRoot || !baseRoot || !outputDirectory) throw new Error('Usage: compare.mjs <head> <base> <output>')
const worker = fileURLToPath(new URL('./worker.mjs', import.meta.url))
const sha = (cwd) => {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' })
  if (result.status !== 0 || !/^[a-f0-9]{40}$/.test(result.stdout.trim())) throw new Error('Cannot resolve commit')
  return result.stdout.trim()
}
const packageJson = (root) => readFile(resolve(root, 'packages/core/package.json'), 'utf8').then(JSON.parse)
const headPackage = await packageJson(headRoot)
const basePackage = await packageJson(baseRoot)
const compatible = (pkg) =>
  ['.', './client', './fetch', './server'].every((key) => pkg.exports?.[key]) && Number(pkg.version.split('.')[0]) >= 2
if (!compatible(headPackage)) throw new Error('Head does not support the v2 benchmark harness')
const hasBaseline = compatible(basePackage)
const aggregate = (runs) => ({
  version: runs[0].version,
  results: runs[0].results.map((row) => ({
    name: row.name,
    samples: runs.flatMap((run, processIndex) =>
      run.results.find((item) => item.name === row.name).samples.map((sample) => ({ ...sample, processIndex }))
    ),
  })),
})
const samples = { head: [], base: [] }
for (let run = 0; run < 3; run++) {
  const order = run % 2 ? ['head', 'base'] : ['base', 'head']
  for (const revision of order) {
    if (revision === 'base' && !hasBaseline) continue
    console.error(`Measure ${revision}, process ${run + 1}/3`)
    const child = spawnSync(process.execPath, [worker, revision === 'head' ? headRoot : baseRoot], {
      encoding: 'utf8',
      timeout: 120000,
    })
    if (child.status !== 0) throw new Error(`${revision} benchmark failed: ${child.stderr}`)
    samples[revision].push(JSON.parse(child.stdout))
  }
}
const snapshot = {
  schemaVersion: 1,
  harnessHash: createHash('sha256')
    .update(await readFile(worker))
    .digest('hex'),
  measuredAt: new Date().toISOString(),
  environment: {
    node: process.versions.node,
    platform: process.platform,
    arch: process.arch,
    cpu: cpus()[0]?.model ?? 'unknown',
  },
  head: { sha: sha(headRoot), ...aggregate(samples.head) },
  baseSha: sha(baseRoot),
  base: hasBaseline ? { sha: sha(baseRoot), ...aggregate(samples.base) } : null,
  baselineReason: hasBaseline
    ? null
    : `@hulla/api ${basePackage.version} predates the v2 contract API; comparing different workloads would be misleading. This run establishes a v2 baseline.`,
}
await mkdir(outputDirectory, { recursive: true })
await writeFile(resolve(outputDirectory, 'comparison.json'), JSON.stringify(snapshot, null, 2) + '\n')
await writeFile(resolve(outputDirectory, 'comment.md'), renderReport(snapshot))
console.log(renderReport(snapshot))
