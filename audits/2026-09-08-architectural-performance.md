# Architectural performance pass — 8 September 2026

Two changes reduce repeated framework work: internal adapter composition now remains synchronous until work actually suspends, then continues through one async continuation; path rendering uses compiled parameter locations instead of building and copying intermediate parameter maps. Public adapter/Fetch Promise APIs, schema policies, middleware, errors, configured body limits and cancellation remain. Codecs still receive isolated declaration groups.

This is incremental progress, not evidence of universal benchmark leadership. The saved Fetch report already led tRPC/oRPC in its cohorts but trailed Hono and sometimes ts-rest. Different validation policies prevent treating that ranking as equivalent functionality.

## Controlled comparison

Three fresh processes per variant on Bun 1.4.0 and Node 22.18.0, alternating before/after order. Each main process uses seven batches, 1,000 warmup operations, 2,000 default iterations and at least 40 ms per batch. Fixture-specific overrides remain. Values below are medians of process medians, in microseconds per operation; they are batch-average costs, not individual-request percentiles. Source snapshots and fixtures were frozen because unrelated work was changing concurrently. The snapshots differ only in the four optimization files. They are bundled source consumers, separate from the public-package benchmark history. Shared-workstation noise remains; tiny changes are inconclusive.

[Raw samples and hashes](2026-09-08-architectural-performance.json) preserve favorable and unfavorable rows, including unchanged direct and in-process controls. Reproduction bundles, source snapshots and raw load distributions are retained in the ignored `benchmarks/results/architecture-2026-09-08/` directory.

| Workload | Bun before → after µs | Change | Node before → after µs | Change |
|---|---:|---:|---:|---:|
| path-parameter-read | 3.872 → 3.412 | -11.9% | 9.376 → 8.658 | -7.7% |
| query-header-read | 7.613 → 7.281 | -4.4% | 12.893 → 12.339 | -4.3% |
| mixed-update | 7.232 → 6.999 | -3.2% | 16.503 → 15.579 | -5.6% |
| static-get | 1.984 → 1.847 | -6.9% | 6.377 → 6.295 | -1.3% |
| small-json-post | 3.334 → 3.310 | -0.7% | 10.831 → 10.773 | -0.5% |
| large-json-post | 49.369 → 48.760 | -1.2% | 72.926 → 73.985 | +1.5% |
| wire-dispatch | 0.537 → 0.496 | -7.6% | 0.546 → 0.514 | -6.0% |
| dynamic-http | 5.646 → 5.259 | -6.9% | 10.910 → 10.420 | -4.5% |
| middleware-context | 2.670 → 2.551 | -4.5% | 6.354 → 6.271 | -1.3% |
| validation-failure | 4.615 → 4.555 | -1.3% | 14.075 → 14.161 | +0.6% |
| codec-roundtrip | 4.235 → 4.165 | -1.7% | 13.067 → 13.221 | +1.2% |
| streaming | 18.280 → 18.306 | +0.1% | 28.249 → 26.874 | -4.9% |
| large-static-dispatch | 0.398 → 0.345 | -13.3% | 0.443 → 0.421 | -5.0% |
| large-dynamic-dispatch | 1.022 → 0.955 | -6.6% | 1.470 → 1.445 | -1.7% |

## Asynchronous behavior and tradeoffs

A separate dynamic POST exercises a schema, context, middleware, handler and output schema, either all synchronous or asynchronous. It uses three fresh processes, nine batches of at least 60 ms and 2,000 warmup operations. The initial Promise-chain implementation regressed fully asynchronous Bun Fetch; it was replaced with a single continuation. Final results:

| Host | Transport | Async stages | Before → after µs | Change |
|---|---|---|---:|---:|
| bun | adapter | False | 0.660 → 0.617 | -6.6% |
| bun | fetch | False | 2.284 → 2.188 | -4.2% |
| bun | adapter | True | 0.799 → 0.826 | +3.4% |
| bun | fetch | True | 2.425 → 2.436 | +0.4% |
| node | adapter | False | 1.001 → 0.955 | -4.7% |
| node | fetch | False | 9.936 → 10.083 | +1.5% |
| node | adapter | True | 1.181 → 1.214 | +2.8% |
| node | fetch | True | 10.294 → 10.101 | -1.9% |

Fully asynchronous adapter-only dispatch adds about 0.03 µs in this measurement; that tradeoff is retained explicitly. Large JSON, codecs and failure paths do not show a consistent gain. The combined browser Fetch client/server fixture grows from 50,632 to 51,136 minified bytes (+504), and from 15,548 to 15,758 gzip bytes (+210). This is one frozen fixture, not a replacement for package-size history.

## Localhost load and lifecycle

Three alternating process pairs on Node, 1,000 requests per closed-loop concurrency cell (1/16/64), and two-second offered-load windows at 100/1,000/5,000 requests/sec. Each process also verifies delayed streams, slow consumers, cancellation/finalization, handler failure, invalid input and abort. All offered-load runs reported zero failures; lifecycle assertions passed. These short shared-workstation windows do not establish production capacity.

For Hulla, median per-process p99 values (milliseconds):

| Workload | Before | After |
|---|---:|---:|
| Concurrency 1 | 0.225 | 0.215 |
| Concurrency 16 | 5.142 | 2.798 |
| Concurrency 64 | 48.768 | 49.869 |
| Offered 100/sec | 2.661 | 2.284 |
| Offered 1000/sec | 4.595 | 4.670 |
| Offered 5000/sec | 4.400 | 4.519 |

Offered-load percentiles include scheduling delay. At 5,000/sec, Hulla per-process p99 ranges span approximately 3.5–15.9 ms before and 3.1–16.7 ms after; the direct control also has large outliers. These distributions are inconclusive for tail-latency improvement or regression. Raw arrivals, heap/RSS observations and event-loop measurements are retained in the reproduction directory; heap deltas are not allocation counts or leak evidence.

## Further work

Prioritize mixed REST APIs with asynchronous handlers. Profile header/query construction and multi-field projection next: these still perform repeated normalization and temporary-object work. Any compiled execution plan must preserve ordinary wire types, codec transformations, middleware ordering and concurrent validation rejection handling. For larger payloads, measure schema traversal, JSON parsing and serialization separately before changing execution; the present dispatch improvements barely affect those workloads.

Production decisions need an absolute latency/CPU budget and sustained load at the application’s normal payload distribution and concurrency. Keep individual-request tails, failures, cancellation and memory observations separate from sequential operation cost. Do not remove validation, cache payload results, or introduce fixture-specific route shortcuts to improve rank.

## Verification

Workspace typechecks, tests, builds and public-export checks passed. Eight source/built consumer boundaries passed, including browser/Node separation. Semantic preflight passed 63 policy operations and 36 focused fixture operations. Core has 229 passing tests, including all 16 sync/async stage combinations, error-phase checks, abort during context, public Promise behavior, Unicode/prototype-named parameters, and asynchronous nested-codec isolation. Targeted formatting/lint and diff whitespace checks passed.

Changes remain uncommitted. Pre-existing and concurrently appearing edits were preserved; the complete workspace checks include those edits but the performance comparison isolates this pass. The broader best-in-class performance goal remains open: these measurements establish specific improvements and bounded tradeoffs, not general leadership.
