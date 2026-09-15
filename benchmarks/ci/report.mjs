export const marker = '<!-- hulla-api-performance-v1 -->'

export function median(values) {
  if (!values.length || values.some((value) => !Number.isFinite(value) || value <= 0)) {
    throw new Error('Expected positive, finite benchmark samples')
  }
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

export function renderReport(snapshot) {
  const { head, base, environment, baselineReason } = snapshot
  const link = (sha) => `[${sha.slice(0, 8)}](https://github.com/hulladev/api/commit/${sha})`
  const rows = head.results.map((result) => {
    const current = median(result.samples.map((sample) => sample.microseconds))
    const previous = base?.results.find((row) => row.name === result.name)
    const baseline = previous && median(previous.samples.map((sample) => sample.microseconds))
    const delta = baseline ? `${((current / baseline - 1) * 100).toFixed(1)}%` : '—'
    const spread = result.samples.map((sample) => sample.microseconds)
    return `| ${result.name} | ${baseline?.toFixed(2) ?? '—'} | ${current.toFixed(2)} | ${delta} | ${Math.round(1e6 / current).toLocaleString('en-US')} | ${Math.min(...spread).toFixed(2)}–${Math.max(...spread).toFixed(2)} |`
  })
  return [
    marker,
    '## API performance comparison',
    '',
    `Head: ${link(head.sha)} (@hulla/api ${head.version}). Base: ${link(snapshot.baseSha)}${base ? ` (@hulla/api ${base.version})` : ''}.`,
    '',
    `Node ${environment.node} · ${environment.platform}/${environment.arch} · ${environment.cpu}`,
    '',
    'Two validated Fetch round trips, entirely in memory (no network, database, or server startup). Both revisions use the same harness and run sequentially on the same runner, alternating revision order across three fresh processes.',
    '',
    '| Scenario | Base µs/op | Head µs/op | Latency change | Head ops/s | Head sample range µs |',
    '| --- | ---: | ---: | ---: | ---: | ---: |',
    ...rows,
    '',
    ...(baselineReason ? [`Baseline unavailable: ${baselineReason}`, ''] : []),
    'Lower latency is better. These are medians of batch-average samples, not request latency percentiles. Hosted runner noise makes this advisory evidence, not a pass/fail regression gate.',
    '',
    `Harness: \`${snapshot.harnessHash}\`. Raw samples and commit metadata are saved in the workflow artifact.`,
    '',
  ].join('\n')
}
