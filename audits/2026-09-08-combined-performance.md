# Combined architectural performance audit — 8 September 2026

The retained changes put Hulla in the top tier of the tested contract-aware request workloads. The final built-package comparison leads several strict-parity/application cases and trails the fastest alternative by at most 9.3% across those cases on Bun and Node. This is the measured outcome, not a previously agreed acceptance threshold. Small differences are descriptive, not statistically established rankings.

The architectural performance goal is complete within the measured scope. This does not establish universal leadership, production saturation capacity, or the smallest bundle. Framework adapter and sustained-load evidence is linked below, with its remaining gaps preserved. No release or commit was requested; changes remain in the working tree alongside preserved unrelated work.

## Retained improvements

- Adapter execution composes synchronous work directly and suspends where asynchronous work occurs, preserving public Promise behavior and error boundaries.
- Contract compilation reuses route parameter plans and avoids needless allocation during construction and outbound path rendering.
- Header/query normalization validates and materializes values once, including safe handling of prototype-like keys.
- Fetch and seven native adapters support targeted header reads. Requests avoid expanding every header merely to inspect content type; declared header schemas still receive full records.
- Stream decoding fuses line/framing work while preserving chunk boundaries, UTF-8, size limits, backpressure and cancellation.
- Unbounded body readers return the native Promise directly where conversion is unnecessary; bounded behavior is retained.

These paths depend on contract semantics and actual input requirements, with no benchmark route names, payload signatures or disabled validation. Per-request header caches do not share request data. Native-writer, parameter-decoder, client-frame and response-table-cache experiments were rejected when gains did not hold across workloads/runtimes.

## Final competitive comparison

Microseconds per operation; positive difference means Hulla is slower. The comparison excludes handwritten direct Fetch from the contract-library ranking, but retains it in raw results. Native-policy rows have different validation guarantees: Hulla retains server and client output validation. They are not strict parity.

| Host | Policy | Scenario | Hulla µs | Fastest other library µs | Difference |
|---|---|---|---:|---|---:|
| bun | strict-parity | static-get | 1.661 | hono 1.537 | +8.0% |
| bun | strict-parity | small-json-post | 2.623 | hono 2.585 | +1.5% |
| bun | strict-parity | large-json-post | 43.280 | ts-rest 44.124 | -1.9% |
| bun | native | static-get | 1.625 | hono 1.444 | +12.5% |
| bun | native | small-json-post | 2.674 | hono 2.502 | +6.9% |
| bun | native | large-json-post | 43.469 | ts-rest 37.796 | +15.0% |
| bun | application | path-parameter-read | 2.861 | ts-rest 3.274 | -12.6% |
| bun | application | query-header-read | 6.457 | hono 6.099 | +5.9% |
| bun | application | mixed-update | 5.989 | ts-rest 5.491 | +9.1% |
| node | strict-parity | static-get | 6.464 | hono 5.914 | +9.3% |
| node | strict-parity | small-json-post | 11.067 | hono 10.835 | +2.1% |
| node | strict-parity | large-json-post | 73.971 | ts-rest 85.231 | -13.2% |
| node | native | static-get | 6.340 | hono 5.650 | +12.2% |
| node | native | small-json-post | 11.300 | hono 10.833 | +4.3% |
| node | native | large-json-post | 73.147 | hono 69.799 | +4.8% |
| node | application | path-parameter-read | 8.971 | hono 9.357 | -4.1% |
| node | application | query-header-read | 12.455 | hono 13.965 | -10.8% |
| node | application | mixed-update | 16.203 | hono 17.857 | -9.3% |

Three fresh processes per runtime use the frozen public built exports and existing fixtures, with external third-party dependencies. Each case runs seven shuffled batches of at least 40 ms, 1,000 warmup calls and 2,000 initial iterations before calibration. Runtime launch order alternates; timed processes do not overlap. Values are median process medians. These local Fetch round trips exclude sockets, and batch averages are not tail latency. Current built packages and original fixtures were re-fingerprinted after measurement and match the saved identity. Do not subtract absolute timings from experiments with different bundling, setup or hardware conditions.

## Supporting evidence and limits

[Architectural execution](2026-09-08-architectural-performance.md), [normalization](2026-09-08-normalization-performance.md), [streaming](2026-09-08-streaming-performance.md), [startup](2026-09-08-startup-performance.md), [body reading](2026-09-08-body-reader-performance.md), [Fetch headers](2026-09-08-header-reader-performance.md), and [native header readers](2026-09-08-native-header-readers.md) contain controlled before/after measurements, adverse cells and regression coverage. Metadata-heavy native Fetch adapter cases improved roughly 74–77% on Bun and 24–35% on Node without a header schema; these are specific measured workloads, not universal request speedups.

The [adapter landscape](2026-09-08-adapter-landscape.md) covers 34 Bun cohorts with three processes each. Hulla had lower medians in 47 of 59 non-direct rows before the latest native-header improvement; these correlated rows are not independent votes or an aggregate score. Express isolated dispatch and some Hono-derived tiny cases remain gaps. The native-header follow-up did not reproduce an initially adverse Express socket result. Node HTTP and Koa have correctness coverage but no standalone throughput claim.

The [core landscape](2026-09-08-performance-landscape.md) includes route/middleware scaling, bounded/chunked payloads, IPC, stream lifecycle and failure checks. The adapter landscape extends offered-load runs to three ten-second processes per runtime at 100/1,000/5,000 requests per second, with zero failures. These are local capacity smoke tests with client and server sharing an event loop; they do not establish isolated-server saturation or long-term production p99 behavior.

The final size check measured the combined Fetch entry at 51,557 minified bytes / 15,974 gzip bytes, excluding Zod as configured by the fixture. This is larger than Hono, ts-rest and oRPC in their corresponding fixture entries and smaller than tRPC. Minimal startup and bundle size remain tradeoffs. No validation was removed to close native-policy gaps.

## Validation and artifacts

The combined audit passed formatting, lint, documentation checks, dead-code analysis, TypeScript, all 63 workspace test tasks, builds, public-export consumers, isolated packed-package consumers, runtime-host probes and bundle-size generation. Turbo reused valid cached typecheck/test/build results in this final pass; preceding implementation passes ran fresh targeted tests, including 261 core tests. Runtime probes verified native Bun HTTP and locally invoked built Vercel Web Handler, not deployed cloud hosts or Deno.

[Raw measurements and artifact hashes](2026-09-08-combined-performance.json) accompany the executable runner, six process outputs, check logs, package-size output and compressed source/build snapshot in ignored `benchmarks/results/combined-audit-2026-09-08/`. Earlier experiment archives remain available. Source trees containing tests are compressed to avoid accidental test discovery. The only current-pass edits are this report, its JSON formatting of the earlier body-reader JSON, and the matching generated-artifact ignore entry; no further production optimization was needed for this assessment.
