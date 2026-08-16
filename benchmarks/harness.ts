/** One complete in-memory client-to-server round trip. */
export type Benchmark = {
  readonly name: string
  readonly run: () => Promise<void>
}

export type BenchmarkOptions = {
  readonly iterations: number
  readonly samples: number
  readonly warmup: number
}

type BenchmarkResult = {
  readonly max: number
  readonly median: number
  readonly min: number
  readonly name: string
  readonly samples: readonly number[]
}

function positiveInteger(name: string, fallback: number): number {
  const value = process.env[name]
  if (value === undefined) return fallback
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new TypeError(`${name} must be a positive integer`)
  return parsed
}

export function benchmarkOptions(): BenchmarkOptions {
  return {
    iterations: positiveInteger('BENCH_ITERATIONS', 5_000),
    samples: positiveInteger('BENCH_SAMPLES', 7),
    warmup: positiveInteger('BENCH_WARMUP', 1_000),
  }
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[middle]!
  return (sorted[middle - 1]! + sorted[middle]!) / 2
}

function formatMicroseconds(nanoseconds: number): string {
  return (nanoseconds / 1_000).toFixed(2)
}

function formatOps(nanoseconds: number): string {
  return Math.round(1_000_000_000 / nanoseconds).toLocaleString('en-US')
}

export async function runBenchmarks(
  benchmarks: readonly Benchmark[],
  options: BenchmarkOptions
): Promise<readonly BenchmarkResult[]> {
  for (const benchmark of benchmarks) {
    for (let iteration = 0; iteration < options.warmup; iteration++) await benchmark.run()
  }

  const measurements = new Map<string, number[]>()
  for (const benchmark of benchmarks) measurements.set(benchmark.name, [])

  for (let sample = 0; sample < options.samples; sample++) {
    const rotated = [
      ...benchmarks.slice(sample % benchmarks.length),
      ...benchmarks.slice(0, sample % benchmarks.length),
    ]
    for (const benchmark of rotated) {
      const start = performance.now()
      for (let iteration = 0; iteration < options.iterations; iteration++) await benchmark.run()
      measurements.get(benchmark.name)!.push(((performance.now() - start) * 1_000_000) / options.iterations)
    }
  }

  return benchmarks.map((benchmark) => {
    const samples = measurements.get(benchmark.name)!
    return {
      name: benchmark.name,
      samples: Object.freeze(samples),
      median: median(samples),
      min: Math.min(...samples),
      max: Math.max(...samples),
    }
  })
}

export function printResults(results: readonly BenchmarkResult[], options: BenchmarkOptions): void {
  const direct = results.find(({ name }) => name.startsWith('Direct Fetch'))?.median ?? results[0]!.median
  const hulla = results.find(({ name }) => name.startsWith('Hulla'))?.median ?? direct

  console.log(
    `${process.versions['bun'] === undefined ? `Node ${process.version}` : `Bun ${process.versions['bun']}`} · ${options.samples} samples × ${options.iterations.toLocaleString('en-US')} iterations`
  )
  console.log('Validated JSON POST · in-memory client → Fetch handler → client')
  console.log('')
  console.log('| Runtime | Median | Ops/sec | vs direct | vs Hulla | Range |')
  console.log('|---|---:|---:|---:|---:|---:|')
  for (const result of results) {
    console.log(
      `| ${result.name} | ${formatMicroseconds(result.median)} µs | ${formatOps(result.median)} | ${(result.median / direct).toFixed(2)}× | ${(result.median / hulla).toFixed(2)}× | ${formatMicroseconds(result.min)}–${formatMicroseconds(result.max)} µs |`
    )
  }
}
