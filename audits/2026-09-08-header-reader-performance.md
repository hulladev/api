# Targeted header reading — 8 September 2026

The preceding parameter experiments produced negative evidence and safety tests. This pass removes unnecessary request-header materialization, a cost that grows with unrelated metadata. The shared-reader implementation is retained.

## Architectural change

The body decoder previously requested a complete normalized header record just to check `content-type`. `AdapterRouteInput` now supports an optional synchronous `readHeader(name)` hook. Explicit header records and parsed-body content types retain their precedence. Adapters without the hook keep the existing full-reader fallback. Declared header schemas still receive and validate the entire record.

Fetch supplies shared reader functions with a cache on each internal dispatch input. Single-header reads use native `Headers.get` until the full record is needed; afterward they read the same cached record. This removes a needless record conversion for body-only validation, shares the existing full-record work when needed, and avoids per-request header-reader closures. Query-bearing inputs retain correct receiver/cache ownership. There is no request-global cache, schema introspection, pre-serialized response, skipped validation, or special behavior based on header count.

An initial closure-based implementation was measured and superseded by shared functions. Its raw samples and source snapshot remain separate in the archive. The retained implementation changes only core adapter input/types and Fetch server execution; other adapters remain compatible through fallback behavior. Fetch-based framework wrappers inherit the improvement.

## Header-count workload

The fixture creates each native Request, performs validated JSON request/response work and consumes the response. Every request has content-type and tenant headers, plus 0/8/32/128 unrelated 64-byte metadata values. The declared-schema variant validates the full header record; the other variant declares no header schema but still checks content type. Direct Fetch uses equivalent body/output validation and full header validation when declared.

Three fresh process pairs per runtime, alternating variant order, use seven shuffled batches of at least 40 ms, 1,000 warmups and 1,000 initial iterations. Summaries are median process medians in microseconds. The final column compares median per-process Hulla/direct cost ratios before and after. These local Fetch measurements include Request/Response conversion but no network, and are not latency percentiles.

| Runtime | Extra headers | Declared header schema | Before µs | After µs | Raw change | Direct-normalized change |
|---|---:|---|---:|---:|---:|---:|
| bun | 0 | false | 1.83 | 1.57 | -14.3% | -13.3% |
| bun | 0 | true | 2.05 | 2.04 | -0.7% | -1.8% |
| bun | 8 | false | 2.96 | 1.72 | -41.8% | -40.8% |
| bun | 8 | true | 3.34 | 3.19 | -4.6% | -1.9% |
| bun | 32 | false | 8.62 | 1.91 | -77.8% | -77.8% |
| bun | 32 | true | 9.63 | 9.00 | -6.5% | +0.2% |
| bun | 128 | false | 58.65 | 2.70 | -95.4% | -95.4% |
| bun | 128 | true | 60.72 | 59.06 | -2.7% | +0.2% |
| node | 0 | false | 9.09 | 8.82 | -3.0% | -2.1% |
| node | 0 | true | 9.71 | 9.79 | +0.9% | +1.3% |
| node | 8 | false | 10.87 | 9.79 | -9.9% | -11.0% |
| node | 8 | true | 11.61 | 11.69 | +0.6% | +3.6% |
| node | 32 | false | 17.74 | 12.57 | -29.1% | -30.2% |
| node | 32 | true | 19.31 | 19.04 | -1.4% | -2.1% |
| node | 128 | false | 45.61 | 22.59 | -50.5% | -49.0% |
| node | 128 | true | 46.78 | 47.51 | +1.6% | +1.7% |

The main benefit is avoiding work on unrelated headers when the contract does not declare a header schema. At 8 extra headers, raw costs improve about 42% on Bun and 10% on Node; at 32, about 78% and 29%. The 128-header result is a stress observation, not a universal speedup. Full header schemas still require materialization, and their results are broadly near controls. No metadata is removed from native requests or from declared schema inputs.

## Ordinary workloads and uncertainty

A separate main fixture covers static/dynamic Fetch adapters with Direct Fetch/Hono controls, path/query/body REST cases, in-process calls, and codecs. It uses 2,000 initial iterations with the same process/batch structure. Unchanged controls drift materially between variants. In the retained comparison, Bun's dynamic adapter cost relative to its direct control improves about 8.9%; Node is about 2.3% worse on that normalized measure. Do not claim a general Node small-request improvement from this run. Full raw values, adverse cells and unchanged controls remain in the JSON.

The repeatable header-count effect on both runtimes, its agreement with the removed operation, and the much smaller movement in matched direct controls support retaining the architectural change. The report makes no claim of universal benchmark leadership.

## Behavior and verification

New tests cover targeted reads without full materialization, complete declared-header validation, compatibility fallback, authoritative explicit headers, parsed-body metadata precedence, rejection before body consumption, and concurrent Fetch request/cache isolation with query-bearing URLs and asynchronous header validation. Adapter-author documentation explains the optional hook and reader consistency requirement. Workspace typechecks, all 63 test tasks, builds, public exports, dead-code analysis and documentation checks passed. Core now has 260 passing tests. Semantic preflight passed 63 policy operations and 36 focused operations. Targeted lint/format and whitespace checks passed. Frozen production sources differ only in the three retained files and match the current source byte for byte.

[Raw samples, summaries, controls, versions and artifact hashes](2026-09-08-header-reader-performance.json) accompany compressed before/intermediate/retained source/build snapshots and executable runners in ignored `benchmarks/results/header-reader-2026-09-08/`. Unrelated changes were preserved, and all work remains uncommitted. The broader performance goal remains active.
