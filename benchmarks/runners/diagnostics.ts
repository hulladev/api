import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import { benchmarkOptions } from '../harness'
import { assertCompatibleIdentity, benchmarkIdentity, type BenchmarkIdentity } from '../harness/provenance'
import type { Diagnostic } from '../suites/diagnostics'

const identity = await benchmarkIdentity()
const options = benchmarkOptions()
const runs: { suite: string; processId: number; results: Diagnostic[] }[] = []
function child(file: string, env = process.env): string {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL(file, import.meta.url))], {
    encoding: 'utf8',
    env,
    timeout: 300000,
    maxBuffer: 32 * 1024 * 1024,
  })
  if (result.status !== 0) throw new Error(`${file} failed: ${result.stderr}\n${result.stdout}`)
  return result.stdout
}
for (const suite of ['scaling', 'sockets', 'ipc', 'lifecycle']) {
  console.log(`Measuring ${suite} in ${options.runs} fresh processes`)
  for (let run = 0; run < options.runs; run++) {
    const snapshot = JSON.parse(
      child('./diagnostic-child.ts', { ...process.env, BENCH_RUN_ID: identity.runId, BENCH_DIAGNOSTIC_SUITE: suite })
    ) as { identity: BenchmarkIdentity; processId: number; results: Diagnostic[] }
    assertCompatibleIdentity(identity, snapshot.identity, suite)
    runs.push({ suite, processId: snapshot.processId, results: snapshot.results })
  }
}
const cold = Array.from({ length: options.runs }, () => {
  const start = performance.now()
  const measurement = JSON.parse(child('./cold-child.ts')) as {
    processId: number
    importsMs: number
    constructionMs: number
    firstCallMs: number
    rssBytes: number
  }
  return { ...measurement, processToFirstResponseMs: performance.now() - start }
})

const scratch = await mkdtemp(fileURLToPath(new URL('../.diagnostic-', import.meta.url)))
const types: Record<string, unknown>[] = []
let browser: { minifiedBytes: number; gzipBytes: number; fixture: string }
try {
  for (const count of [10, 100, 1000])
    for (const nested of [false, true]) {
      const routes = Array.from(
        { length: count },
        (_, index) =>
          `r${index}: route.get('/${index}', { responses: { 200: response.json(), 404: response.empty() } })`
      ).join(',\n')
      const handlers = Array.from(
        { length: count },
        (_, index) => `r${index}: () => ({ status: 200, body: { id: ${index} } })`
      ).join(',\n')
      const authoredRoutes = nested ? `resources: router('/resources', { routes: { ${routes} } })` : routes
      const authoredHandlers = nested ? `resources: { ${handlers} }` : handlers
      const selection = nested ? 'resources.r0' : 'r0'
      const call = nested ? `resources.r${count - 1}` : `r${count - 1}`
      const source = `import { defineContract, response, route, router } from '@hulla/api';\nimport { defineClient } from '@hulla/api/client';\nimport { defineServer } from '@hulla/api/server';\nconst contract = defineContract({ routes: { ${authoredRoutes} } });\nexport const server = defineServer(contract).implement({ ${authoredHandlers} });\nexport const client = defineClient(contract, { transport: () => { throw new Error() } });\nexport const selected = client.select(contract.routes.${selection});\nexport const result = client.${call}();\n`
      const path = `${scratch}/consumer.ts`
      await writeFile(path, source)
      for (let run = 0; run < options.runs; run++) {
        const start = performance.now()
        const result = spawnSync(
          'bun',
          [
            'x',
            '--no-install',
            'tsc',
            '--ignoreConfig',
            '--noEmit',
            '--strict',
            '--skipLibCheck',
            '--target',
            'ES2022',
            '--module',
            'NodeNext',
            '--moduleResolution',
            'NodeNext',
            '--extendedDiagnostics',
            path,
          ],
          { encoding: 'utf8', timeout: 120000 }
        )
        if (result.status !== 0) throw new Error(`Type consumer failed: ${result.stdout}\n${result.stderr}`)
        types.push({ routes: count, nested, processMs: performance.now() - start, diagnostics: result.stdout })
      }
      const declarations = `${scratch}/declarations-${count}-${nested}`
      const emitted = spawnSync(
        'bun',
        [
          'x',
          '--no-install',
          'tsc',
          '--ignoreConfig',
          '--declaration',
          '--emitDeclarationOnly',
          '--strict',
          '--skipLibCheck',
          '--target',
          'ES2022',
          '--module',
          'NodeNext',
          '--moduleResolution',
          'NodeNext',
          '--outDir',
          declarations,
          path,
        ],
        { encoding: 'utf8', timeout: 120000 }
      )
      if (emitted.status !== 0)
        throw new Error(`Consumer declaration emit failed: ${emitted.stdout}\n${emitted.stderr}`)
      types.push({
        routes: count,
        nested,
        declarationBytes: (await readFile(`${declarations}/consumer.d.ts`)).byteLength,
      })
    }
  const entry = `${scratch}/browser.ts`
  await writeFile(
    entry,
    `import { defineContract, response, route } from '@hulla/api';\nimport { defineClient } from '@hulla/api/client';\nimport { fetchTransport } from '@hulla/api/fetch';\nconst contract = defineContract({ routes: { health: route.get('/', { responses: { 200: response.json() } }) } });\nexport const client = defineClient(contract, { transport: fetchTransport({ baseUrl: 'https://api.example.com' }) });\nexport const health = () => client.health();\n`
  )
  const bundle = `${scratch}/browser.js`
  const built = spawnSync('bun', ['build', entry, '--target=browser', '--minify', `--outfile=${bundle}`], {
    encoding: 'utf8',
  })
  if (built.status !== 0) throw new Error(`Browser build failed: ${built.stderr}`)
  const bytes = await readFile(bundle)
  if (/\bnode:/.test(bytes.toString())) throw new Error('Browser bundle retained a Node builtin')
  browser = {
    minifiedBytes: bytes.length,
    gzipBytes: gzipSync(bytes).length,
    fixture: 'executable Fetch client, schema-free JSON, public built exports',
  }
} finally {
  await rm(scratch, { recursive: true, force: true })
}

const root = new URL('../results/', import.meta.url)
await mkdir(root, { recursive: true })
await writeFile(
  new URL('diagnostics-latest.json', root),
  `${JSON.stringify({ identity, configuration: options, generatedAt: new Date().toISOString(), runs, cold, types, browser }, null, 2)}\n`
)
function percentile(values: readonly number[], p: number) {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.ceil(sorted.length * p) - 1]!
}
const report = [
  '# Performance diagnostics',
  '',
  'These are diagnostics, not a cross-package ranking. Each row is one process; request latency includes body consumption. Fixed-concurrency rows use closed-loop localhost clients. Offered-load rows schedule arrivals independently and include scheduler/queue delay in latency; neither is a production capacity claim. Keep process rows separate when comparing distributions.',
  '',
  '| Operation | Dimensions | Process | Throughput / s | p50 ms | p95 ms | p99 ms | Event-loop p99 ms | Heap delta bytes | RSS bytes | Failures |',
  '|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|',
]
for (const run of runs)
  for (const result of run.results)
    report.push(
      `| ${result.operation} | ${JSON.stringify(result.dimensions)} | ${run.processId} | ${result.operationsPerSecond.toFixed(0)} | ${percentile(result.latencyMs, 0.5).toFixed(3)} | ${percentile(result.latencyMs, 0.95).toFixed(3)} | ${percentile(result.latencyMs, 0.99).toFixed(3)} | ${result.eventLoopP99Ms.toFixed(3)} | ${result.heapDeltaBytes} | ${result.rssBytes} | ${result.failures ?? 0} |`
    )
report.push(
  '',
  'Event-loop histograms use 10 ms resolution; very short runs cannot resolve meaningful event-loop delay. Heap deltas include GC timing and are not allocation counts or leak verdicts. Raw observations, cold-process timings and complete TypeScript diagnostics are in the JSON artifact.',
  '',
  `Browser Fetch client: ${browser.minifiedBytes} minified bytes; ${browser.gzipBytes} gzip bytes.`,
  '',
  '| Cold process | Process to first response ms | Imports ms | Construction ms | First call ms |',
  '|---:|---:|---:|---:|---:|'
)
for (const result of cold)
  report.push(
    `| ${result.processId} | ${result.processToFirstResponseMs.toFixed(2)} | ${result.importsMs?.toFixed(2)} | ${result.constructionMs?.toFixed(2)} | ${result.firstCallMs?.toFixed(2)} |`
  )
await writeFile(new URL('diagnostics-latest.md', root), `${report.join('\n')}\n`)
console.log(`Diagnostics: ${new URL('diagnostics-latest.md', root).pathname}`)
