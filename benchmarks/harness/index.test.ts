import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import {
  benchmarkDimensions,
  compareBenchmarkSamples,
  medianConfidenceInterval,
  runBenchmarkRuns,
  summarizeBenchmarkResult,
  updateBenchmarkReportAdapterSummary,
  writeBenchmarkReport,
  writeBenchmarkSnapshot,
  type Benchmark,
  type BenchmarkOptions,
} from './index'

describe('benchmark statistics', () => {
  test('reports an exact interval for constant samples', () => {
    expect(medianConfidenceInterval([100, 100, 100, 100, 100], 200)).toEqual({ low: 100, high: 100 })
  })

  test('detects a clear raw regression', () => {
    const comparison = compareBenchmarkSamples(
      [119, 120, 120, 121, 122],
      [99, 100, 100, 101, 102],
      undefined,
      undefined,
      0.02,
      500
    )
    expect(comparison.basis).toBe('raw')
    expect(comparison.verdict).toBe('slower')
    expect(comparison.confidenceLow).toBeGreaterThan(0)
  })

  test('normalizes machine-wide drift against the direct baseline', () => {
    const comparison = compareBenchmarkSamples(
      [119, 120, 120, 121, 122],
      [99, 100, 100, 101, 102],
      [119, 120, 120, 121, 122],
      [99, 100, 100, 101, 102],
      0.02,
      500
    )
    expect(comparison.basis).toBe('direct-normalized')
    expect(comparison.change).toBe(0)
    expect(comparison.verdict).toBe('negligible')
  })
})

describe('benchmark runner', () => {
  test('collects multiple independent runs by default runner semantics', async () => {
    let calls = 0
    const benchmark: Benchmark = {
      runtime: 'Direct Fetch',
      scenario: 'static-get',
      async run() {
        calls += 1
      },
    }
    const options: BenchmarkOptions = {
      iterations: 10,
      minSampleTimeMs: 1,
      runs: 2,
      samples: 3,
      warmup: 1,
    }
    const [result] = await runBenchmarkRuns([benchmark], options)
    expect(result?.runs).toBe(2)
    expect(result?.samples).toHaveLength(6)
    expect(result).toMatchObject({
      adapter: 'fetch',
      functionality: 'static-read',
      implementation: 'direct',
      iterations: 10,
      phase: 'roundtrip',
      protocol: 'direct',
      suite: 'application',
      warmup: 1,
    })
    expect(calls).toBeGreaterThan(60)
  })
})

describe('benchmark artifacts', () => {
  test('assigns explicit package and protocol identities', () => {
    expect(benchmarkDimensions('@hulla/api Express', 'adapter-static-dispatch')).toMatchObject({
      adapter: 'express',
      implementation: '@hulla/api',
      protocol: 'rest',
      suite: 'adapter',
    })
    expect(benchmarkDimensions('Hono Fetch', 'fetch-adapter-static-dispatch')).toMatchObject({
      adapter: 'fetch',
      implementation: 'hono',
      protocol: 'rest',
    })
  })

  test('writes concrete per-operation comparisons and a flat agent snapshot', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'hulla-benchmark-'))
    const reportPath = join(directory, 'latest.md')
    const snapshotPath = join(directory, 'latest.json')
    const options: BenchmarkOptions = { iterations: 10, minSampleTimeMs: 1, runs: 1, samples: 3, warmup: 1 }
    const results = [
      summarizeBenchmarkResult('native', 'Direct Fetch', 'fetch-adapter-static-dispatch', [100, 101, 102]),
      summarizeBenchmarkResult('native', '@hulla/api Fetch', 'fetch-adapter-static-dispatch', [200, 201, 202]),
      summarizeBenchmarkResult('native', 'ts-rest Fetch', 'fetch-adapter-static-dispatch', [250, 251, 252]),
      summarizeBenchmarkResult('native', 'tRPC Fetch', 'fetch-adapter-static-dispatch', [300, 301, 302]),
      summarizeBenchmarkResult('native', 'oRPC Fetch', 'fetch-adapter-static-dispatch', [350, 351, 352]),
      summarizeBenchmarkResult('native', 'Hono Fetch', 'fetch-adapter-static-dispatch', [150, 151, 152]),
      summarizeBenchmarkResult('native', 'Direct Express', 'adapter-static-dispatch', [400, 401, 402]),
      summarizeBenchmarkResult('native', '@hulla/api Express', 'adapter-static-dispatch', [500, 501, 502]),
      summarizeBenchmarkResult('focused', 'Direct Fetch', 'dynamic-http', [600, 601, 602]),
      summarizeBenchmarkResult('focused', '@hulla/api', 'dynamic-http', [700, 701, 702]),
    ]
    const packageSizes = [
      {
        comparison: 'executable' as const,
        runtime: '@hulla/api 0.0.0',
        imports: '@hulla/api + /client + /server + /fetch',
        minifiedBytes: 40_000,
        gzipBytes: 10_000,
      },
      {
        comparison: 'executable' as const,
        runtime: 'tRPC 0.0.0',
        imports: '@trpc/client + @trpc/server',
        minifiedBytes: 60_000,
        gzipBytes: 20_000,
      },
      {
        comparison: 'breakdown' as const,
        runtime: 'Fetch client transport',
        imports: '@hulla/api/fetch (fetchTransport)',
        minifiedBytes: 2_000,
        gzipBytes: 1_000,
      },
    ]
    const history = {
      compatibleRuns: 1,
      currentLabel: '@hulla/api 0.0.0 · local',
      environment: {
        architecture: 'test',
        cpu: 'test',
        host: 'test',
        osRelease: 'test',
        platform: 'test',
        runtime: 'test',
      },
      fingerprint: 'test',
      path: 'history.ndjson',
      source: { commit: 'test', dirty: true, packageVersion: '0.0.0' },
      totalRuns: 1,
    }
    const adapterCohorts = [
      {
        cohort: { adapter: 'fetch' as const, competitor: 'ts-rest' as const },
        results: results.filter(
          ({ implementation, scenario }) =>
            scenario === 'fetch-adapter-static-dispatch' && ['direct', '@hulla/api', 'ts-rest'].includes(implementation)
        ),
      },
      {
        cohort: { adapter: 'next' as const, competitor: 'direct' as const },
        results: [
          summarizeBenchmarkResult('native', 'Direct Next.js', 'next-adapter-static-dispatch', [300, 301, 302]),
          summarizeBenchmarkResult('native', '@hulla/api Next.js', 'next-adapter-static-dispatch', [400, 401, 402]),
        ],
      },
    ]
    await writeBenchmarkReport(results, packageSizes, options, reportPath, history, adapterCohorts)
    await writeBenchmarkSnapshot(results, packageSizes, options, snapshotPath, history)

    const report = await readFile(reportPath, 'utf8')
    expect(report).toContain('## Cross-package overview')
    expect(report).toContain('## Framework adapter overview')
    expect(report).toContain(
      '| Adapter | Comparison | Operations | @hulla/api latency | Comparison latency | Comparison vs @hulla/api | @hulla/api vs direct |'
    )
    expect(report).not.toContain('| Adapter | Independent cohort |')
    expect(report).not.toContain('| Detailed results |')
    expect(report).toContain(
      '| Fetch | [ts-rest](adapters-latest.md#fetch-hullaapi-vs-ts-rest) | 1 | 0.20 µs | 0.25 µs | 1.25× | 1.99× |'
    )
    expect(report).toContain(
      '| Next.js | [direct](adapters-latest.md#next-hullaapi-vs-direct) | 1 | 0.40 µs | 0.30 µs | 0.75× | 1.33× |'
    )
    expect(report).toContain('| Cohort | Adapter | Operations | Direct | @hulla/api | ts-rest | tRPC | oRPC | Hono |')
    expect(report).toContain('## Measured operation comparisons')
    expect(report).toContain('### Fetch adapter')
    expect(report).toContain('##### Fetch adapter static dispatch using each package’s native protocol')
    expect(report).toContain(
      '| Package / implementation | Median [95% CI] | Min–max | vs direct | vs @hulla/api | Change from previous [95% CI] |'
    )
    expect(report).toContain('await fetchHandler(new Request("https://bench.local/<native-static-endpoint>"))')
    expect(report).not.toContain('| Samples |')
    expect(report).not.toContain('| Ops/sec |')
    expect(report).toContain('| Direct Fetch | 0.10 [0.10, 0.10] µs | 0.10–0.10 µs |')
    expect(report).toContain('| @hulla/api Fetch | 0.20 [0.20, 0.20] µs | 0.20–0.20 µs |')
    expect(report).toContain('| Hono Fetch | 0.15 [0.15, 0.15] µs | 0.15–0.15 µs |')
    expect(report).toContain('#### Focused @hulla/api diagnostics')
    expect(report).toContain('##### Dynamic path, query, and header transport with directional validation')
    expect(report).toContain('### Express adapter')
    expect(report).toContain('##### Express adapter static dispatch with 256 routes or procedures')
    expect(report).toContain('### Executable package comparison')
    expect(report).toContain('| tRPC 0.0.0 | @trpc/client + @trpc/server | 58.59 KiB | 1.50× | 19.53 KiB | 2.00× |')
    expect(report).toContain('### @hulla/api tree-shaking checks')
    expect(report).toContain(
      '| Fetch client transport | @hulla/api/fetch (fetchTransport) | 1.95 KiB | 5.0% | 0.98 KiB | 10.0% |'
    )
    const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8')) as {
      methodologyVersion: number
      results: {
        adapter: string
        implementation: string
        sampleCount: number
        samples?: number[]
        scenario: string
      }[]
      schemaVersion: number
    }
    expect(snapshot).toMatchObject({ schemaVersion: 2, methodologyVersion: 2 })
    expect(
      snapshot.results.map(({ adapter, implementation, scenario }) => `${adapter}:${scenario}:${implementation}`)
    ).toEqual([
      'express:adapter-static-dispatch:@hulla/api',
      'express:adapter-static-dispatch:direct',
      'fetch:fetch-adapter-static-dispatch:@hulla/api',
      'fetch:fetch-adapter-static-dispatch:direct',
      'fetch:fetch-adapter-static-dispatch:hono',
      'fetch:fetch-adapter-static-dispatch:orpc',
      'fetch:fetch-adapter-static-dispatch:trpc',
      'fetch:fetch-adapter-static-dispatch:ts-rest',
      'fetch:dynamic-http:@hulla/api',
      'fetch:dynamic-http:direct',
    ])
    expect(snapshot.results.every(({ sampleCount, samples }) => sampleCount === 3 && samples === undefined)).toBe(true)
  })

  test('aggregates only complete cross-package cohorts', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'hulla-benchmark-'))
    const reportPath = join(directory, 'latest.md')
    const options: BenchmarkOptions = { iterations: 10, minSampleTimeMs: 1, runs: 1, samples: 3, warmup: 1 }
    const scenarios = ['path-parameter-read', 'query-header-read', 'mixed-update'] as const
    const results = scenarios.flatMap((scenario) => [
      summarizeBenchmarkResult('application', 'Direct Fetch', scenario, [99, 100, 101]),
      summarizeBenchmarkResult('application', '@hulla/api', scenario, [199, 200, 201]),
      summarizeBenchmarkResult('application', 'ts-rest', scenario, [299, 300, 301]),
    ])

    await writeBenchmarkReport(results, [], options, reportPath, {
      compatibleRuns: 1,
      currentLabel: '@hulla/api 0.0.0 · local',
      path: 'history.ndjson',
    })

    const report = await readFile(reportPath, 'utf8')
    expect(report).toContain('| Representative application requests | Fetch | 3 | 0.50× | 1.00× | 1.50× | — | — | — |')
    expect(report).not.toContain('| Adapter dispatch |')
    expect(report).not.toContain('[Express adapter results](#express-adapter)')
    expect(report).toContain('[Independent adapter cohorts](adapters-latest.md)')
  })

  test('refreshes the framework adapter overview in an existing main report', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'hulla-benchmark-'))
    const reportPath = join(directory, 'latest.md')
    const options: BenchmarkOptions = { iterations: 10, minSampleTimeMs: 1, runs: 1, samples: 3, warmup: 1 }
    const results = [
      summarizeBenchmarkResult('native', 'Direct Next.js', 'next-adapter-static-dispatch', [100, 101, 102]),
      summarizeBenchmarkResult('native', '@hulla/api Next.js', 'next-adapter-static-dispatch', [200, 201, 202]),
    ]
    const history = {
      compatibleRuns: 1,
      currentLabel: '@hulla/api 0.0.0 · local',
      path: 'history.ndjson',
    }

    await writeBenchmarkReport(results, [], options, reportPath, history)
    expect(
      await updateBenchmarkReportAdapterSummary(reportPath, [
        { cohort: { adapter: 'next', competitor: 'direct' }, results },
      ])
    ).toBe(true)
    const refreshedResults = [
      summarizeBenchmarkResult('native', 'Direct Next.js', 'next-adapter-static-dispatch', [150, 151, 152]),
      summarizeBenchmarkResult('native', '@hulla/api Next.js', 'next-adapter-static-dispatch', [200, 201, 202]),
    ]
    expect(
      await updateBenchmarkReportAdapterSummary(reportPath, [
        { cohort: { adapter: 'next', competitor: 'direct' }, results: refreshedResults },
      ])
    ).toBe(true)

    const report = await readFile(reportPath, 'utf8')
    expect(report).toContain('- [Framework adapter overview](#framework-adapter-overview)')
    expect(report).toContain(
      '| Next.js | [direct](adapters-latest.md#next-hullaapi-vs-direct) | 1 | 0.20 µs | 0.15 µs | 0.75× | 1.33× |'
    )
    expect(report).not.toContain(
      '| Next.js | [direct](adapters-latest.md#next-hullaapi-vs-direct) | 1 | 0.20 µs | 0.10 µs | 0.50× |'
    )
    expect(report.match(/## Framework adapter overview/g)).toHaveLength(1)
  })
})
