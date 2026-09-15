# Independent adapters and sustained socket load — 8 September 2026

The prior goal turn established current core competitiveness and identified remaining adapter/load evidence gaps. This pass completes all 34 existing Bun adapter cohorts and extends the Node/Bun socket observations. No production code changed.

## Adapter findings

Each cohort runs in three fresh processes with its own direct/Hulla/competitor baseline, seven batches, at least 20 ms per batch, 1,000 warmup operations and 1,000 initial iterations. Case order is shuffled by the harness. Summaries here use median process medians; the archived standard report uses its existing pooled summary. Comparisons remain within cohorts. These are batch costs, not request latency percentiles.

Hulla has lower measured costs in 47 of 59 non-direct competitor rows. The rows share scenarios and are not independent votes or a meaningful aggregate performance score. There are still material gaps. Rows where Hulla exceeds the competitor by more than 3% are listed below; the threshold is for presentation, not statistical significance.

| Cohort | Scenario | Hulla µs | Peer µs | Hulla difference |
|---|---|---:|---:|---:|
| cloudflare / hono | cloudflare-adapter-static-dispatch | 1.39 | 1.01 | +37.2% |
| cloudflare / hono | cloudflare-adapter-dynamic-dispatch | 3.83 | 3.13 | +22.4% |
| fetch / hono | fetch-adapter-static-dispatch | 1.35 | 1.02 | +32.5% |
| fetch / hono | fetch-adapter-dynamic-dispatch | 3.81 | 3.19 | +19.3% |
| express / ts-rest | adapter-static-dispatch | 1.59 | 0.98 | +62.6% |
| express / ts-rest | adapter-dynamic-dispatch | 2.26 | 1.15 | +96.8% |
| express / ts-rest | express-http-dynamic-roundtrip | 73.77 | 69.51 | +6.1% |
| express / orpc | express-http-static-roundtrip | 62.89 | 60.58 | +3.8% |
| express / orpc | express-http-dynamic-roundtrip | 71.64 | 62.16 | +15.3% |
| next / hono | next-adapter-static-dispatch | 2.53 | 2.25 | +12.4% |
| next / hono | next-adapter-dynamic-dispatch | 5.53 | 5.06 | +9.2% |

Hono static Fetch/Cloudflare fixtures return the static object without server output validation, whereas Hulla validates it. Dynamic Hono fixtures do validate params/query/body/output, so the dynamic difference deserves further investigation. Validation must remain intact when optimizing Hulla. The native profile does not promise identical cancellation/error/context behavior.

Express isolated dispatch invokes recorded endpoint handlers and is not an HTTP latency measurement. Its much larger relative gap versus ts-rest shrinks to roughly 6% in the dynamic HTTP case. Hulla also tracks request lifetime and routes failures through its transport boundary. Removing those guarantees to win the isolated fixture would be inappropriate.

Express HTTP fixtures register 256 static REST routes plus a dynamic route for Hulla/direct/ts-rest; oRPC enters through one middleware handler and uses its own protocol/router. Hulla is close to direct Express but trails oRPC dynamic HTTP by about 15%. Native Express routing is a plausible contributor, not a proved causal explanation. Changing host registration requires preserving mounted-router semantics, parameters, middleware and error behavior.

## Longer socket observations

Three fresh processes per runtime each use 5,000 requests at closed-loop concurrency 1/16/64, followed by ten-second offered-load windows at 100/1,000/5,000 requests per second for direct and Hulla. Runtimes alternate process order. No benchmark CPU work ran concurrently. The table reports Hulla's median process achieved rate and median process p99 from scheduled arrival to completion; the latter includes driver scheduling delay.

| Runtime | Offered req/s | Achieved req/s | Total scheduled across 3 processes | Failures | Median process p99 ms |
|---|---:|---:|---:|---:|---:|
| bun | 100 | 100 | 3000 | 0 | 2.20 |
| bun | 1000 | 1000 | 30000 | 0 | 1.33 |
| bun | 5000 | 5000 | 150000 | 0 | 2.57 |
| node | 100 | 100 | 3000 | 0 | 3.51 |
| node | 1000 | 1000 | 30000 | 0 | 3.41 |
| node | 5000 | 5000 | 150000 | 0 | 9.22 |

These longer runs test stability at the offered rates, not maximum sustainable capacity. Client/server share an event loop and the driver schedules timers for the whole window; neither isolates server CPU nor emulates a remote load generator. Direct runs precede Hulla in each process, so cross-implementation closed-loop rankings can carry initialization/order bias. No sustained-load architectural speedup is claimed. Per-process latency summaries, maxima, memory observations and event-loop delays are in the JSON; complete arrivals are in compressed artifacts. Heap deltas are not leak measurements.

## Next architectural step and verification

The strongest new implementation candidate is to carry synchronous execution through native adapter boundaries: core route execution can already finish synchronously, but public route execution and native writers still introduce Promise boundaries. Investigate an internal compiled path that preserves the existing public Promise APIs, cancellation, stream cleanup and transport-error behavior. Retain it only after broad Node/Bun before/after measurements. This is a candidate, not an implemented or verified improvement.

The broader goal remains active. Core is competitive, but Hono adapter and Express gaps above mean overall leadership is unproven. Current Node/Bun core results are covered by the preceding landscape report; this full framework-cohort run is Bun-only. All cohort runners completed their fixture checks and input-identity checks. No production edits require a repeated workspace test run in this pass.

[Raw batches, cohort comparisons, per-process load summaries and hashes](2026-09-08-adapter-landscape.json) are archived with compressed full load observations and frozen source/builds in ignored `benchmarks/results/adapter-landscape-2026-09-08/`. Existing reports and unrelated work were preserved.
