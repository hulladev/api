# Performance landscape after architectural improvements — 8 September 2026

The preceding body-reader pass changed production code and added regression coverage. This pass re-evaluates the current built public packages against competitors on both Bun and Node, then exercises broader runtime behavior. It makes no further production-code changes.

## Current competitive position

Hulla is now competitive with the fastest tested contract-aware alternatives across the representative Fetch cases. Under strict parity, its largest gap is 5.5%; it leads large JSON on both runtimes and small JSON on Node. For the application cases it leads path/query reads on Bun and all three cases on Node; Bun mixed update trails ts-rest by 5.6%. This supports a strong current position in these workloads, not universal leadership or a retrospective percentage improvement from historical incompatible runs.

Native policies differ: Hulla validates response output on both boundaries while some competitors do less output validation. Its largest native gap is 13.7%, on Bun large JSON versus ts-rest. The implementation retains those guarantees. Direct Fetch is included in raw results as a handwritten lower-bound reference, not treated as a contract-library competitor.

Values are microseconds per operation, summarized as median process medians. Positive difference means Hulla is slower than the fastest other library in that row. Small differences are not established statistically by these three-process samples.

| Host | Policy | Scenario | Hulla µs | Fastest other library µs | Hulla difference |
|---|---|---|---:|---|---:|
| bun | strict-parity | static-get | 1.862 | Hono RPC 1.764 | +5.5% |
| bun | strict-parity | small-json-post | 3.105 | Hono RPC 2.995 | +3.7% |
| bun | strict-parity | large-json-post | 48.316 | ts-rest 48.751 | -0.9% |
| bun | application | path-parameter-read | 3.281 | ts-rest 3.808 | -13.8% |
| bun | application | query-header-read | 7.031 | Hono RPC 7.192 | -2.2% |
| bun | application | mixed-update | 6.720 | ts-rest 6.362 | +5.6% |
| bun | native | static-get | 1.869 | Hono RPC 1.707 | +9.5% |
| bun | native | small-json-post | 3.097 | Hono RPC 2.867 | +8.0% |
| bun | native | large-json-post | 48.800 | ts-rest 42.923 | +13.7% |
| node | strict-parity | static-get | 7.366 | Hono RPC 7.067 | +4.2% |
| node | strict-parity | small-json-post | 13.188 | Hono RPC 13.330 | -1.1% |
| node | strict-parity | large-json-post | 84.523 | ts-rest 98.894 | -14.5% |
| node | application | path-parameter-read | 10.498 | Hono RPC 11.161 | -5.9% |
| node | application | query-header-read | 14.207 | Hono RPC 16.769 | -15.3% |
| node | application | mixed-update | 18.867 | Hono RPC 21.116 | -10.7% |
| node | native | static-get | 7.365 | Hono RPC 6.944 | +6.1% |
| node | native | small-json-post | 13.004 | Hono RPC 12.500 | +4.0% |
| node | native | large-json-post | 88.985 | Hono RPC 81.170 | +9.6% |

## Method and scope

Three fresh processes per runtime execute all six libraries in the same process with case order shuffled independently within batches by the existing harness. Each case uses seven batches, at least 40 ms per batch, 1,000 warmup calls, and 2,000 initial iterations before calibration. Bun/Node process launch order alternates. The harness and fixtures are frozen alongside public built workspace exports; third-party dependencies remain external, with the lockfile and versions archived. No timers overlap across benchmark processes. These are local Fetch request/response round trips without sockets, and batch-average costs are not p99 request latencies.

This source/built-package runner differs from earlier source-bundled optimization comparisons, so absolute values must not be subtracted across reports. Use the within-run competitor comparisons here. The previous workspace verification passed 249 core tests and the broader workspace typecheck/test/build/export/dead-code checks; no production changes occurred during this measurement pass.

## Broader behavior checks

Each of four diagnostic suites ran in a separate fresh process on each runtime: 32 scaling/body cases, 12 socket cases, four IPC cases, and five lifecycle cases. All completed their semantic assertions. Offered-load runs recorded zero failures at 100, 1,000 and 5,000 requests per second over one second per setting on both runtimes. Each implementation completed approximately its offered rate.

Coverage includes 1/32/256/2,048 routes, uniform hits with misses and wrong methods, 0/1/5 middleware, 1 KiB–1 MiB payloads, bounded and unbounded chunked body reads, socket concurrency 1/16/64, MessagePort payload/concurrency combinations, delayed stream producers/consumers, cancellation/finalization, invalid input, handler failure and abort behavior.

These short diagnostic runs are correctness and capacity smoke tests. They are not sustained production load, a saturation search, or statistically defensible latency rankings. Direct and Hulla socket implementations execute in a fixed order and share one process per suite, so JIT/runtime initialization can bias their relative results; notably Node's later Hulla case looks faster than direct in the short closed-loop run. Do not claim that as an architectural speedup. Heap deltas are not retained-allocation measurements, and event-loop percentiles from short runs are weak evidence.

## Completion assessment and next work

The current evidence contradicts the initial premise of falling behind in most of these representative core benchmarks. The retained work reduces general compilation, normalization, execution and stream-framing overhead without schema-specific or workload-specific shortcuts. Prior reports document rejected changes and adverse cells as well as gains.

The broader goal remains active: equivalent fresh evidence is still needed for framework adapter cohorts and longer load behavior before claiming overall top-tier performance across the supported architecture. Tiny responses and minimal application startup remain optimization gaps, even where current request costs are competitive. Further changes should target profiles from the remaining gaps, not remove validation to beat native-policy rows.

[Raw process samples, diagnostics, environment and hashes](2026-09-08-performance-landscape.json) are retained with executable runners and compressed source/build snapshots in ignored `benchmarks/results/landscape-2026-09-08/`. Current built packages and original fixtures were re-fingerprinted after measurement and match the saved identity. Runner files added inside the private snapshot are covered by the artifact hashes; the saved workload fingerprint describes the original repository fixtures. No existing benchmark report or source was overwritten.
