import assert from 'node:assert/strict'
import { test } from 'node:test'
import { median, renderReport, marker } from './report.mjs'

test('median rejects invalid samples and handles even sample counts', () => {
  assert.equal(median([4, 1, 3, 2]), 2.5)
  assert.throws(() => median([]))
  assert.throws(() => median([NaN]))
})
const row = (values) => ({ name: 'small-json-post', samples: values.map((microseconds) => ({ microseconds })) })
const snapshot = {
  head: { sha: 'a'.repeat(40), version: '2.0.1', results: [row([20, 30, 40])] },
  base: { sha: 'b'.repeat(40), version: '2.0.0', results: [row([10, 20, 30])] },
  baseSha: 'b'.repeat(40),
  environment: { node: '24', platform: 'linux', arch: 'x64', cpu: 'test' },
  harnessHash: 'test',
}
test('report uses latency direction and includes both immutable commit references', () => {
  const report = renderReport(snapshot)
  assert.ok(report.startsWith(marker))
  assert.ok(report.includes('| 20.00 | 30.00 | 50.0% |'))
  assert.ok(report.includes('/commit/' + 'a'.repeat(40)))
  assert.ok(report.includes('/commit/' + 'b'.repeat(40)))
})
test('incompatible baselines produce no invented comparison', () => {
  const report = renderReport({ ...snapshot, base: null, baselineReason: 'v1 API is incompatible' })
  assert.ok(report.includes('| — | 30.00 | — |'))
  assert.ok(report.includes('Baseline unavailable: v1 API is incompatible'))
})
