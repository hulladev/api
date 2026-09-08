import { expect, test } from 'vitest'
import {
  hullaApiApplicationBenchmarks,
  hullaApiBenchmarks,
  hullaApiNativeBenchmarks,
  hullaApiInProcessBenchmarks,
} from '../hulla-api'
import { benchmarkDimensions, summarizeBenchmarkResult, transportComparisonLines } from './index'

test('every everyday Fetch scenario has the same in-process workload and assertions', async () => {
  const fetch = [...hullaApiBenchmarks, ...hullaApiNativeBenchmarks, ...hullaApiApplicationBenchmarks]
  const key = (benchmark: (typeof fetch)[number]) => `${benchmark.profile ?? 'strict-parity'}/${benchmark.scenario}`
  expect(hullaApiInProcessBenchmarks.map(key).sort()).toEqual(fetch.map(key).sort())
  expect(fetch).toHaveLength(9)
  for (const benchmark of [...fetch, ...hullaApiInProcessBenchmarks]) await benchmark.run()
})

test('labels in-process separately and pairs both transports in the report', () => {
  expect(benchmarkDimensions('@hulla/api in-process', 'large-json-post').adapter).toBe('none')
  const results = ['@hulla/api', '@hulla/api in-process'].map((runtime, index) =>
    summarizeBenchmarkResult('native', runtime, 'large-json-post', [2000 / (index + 1)], 1)
  )
  const report = transportComparisonLines(results).join('\n')
  expect(report).toContain('Fetch median [95% CI] | In-process median [95% CI]')
  expect(report).toContain('2.00×')
  expect(report).toContain('does not use a network socket')
})
