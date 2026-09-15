# Fetch body reader performance — 8 September 2026

The best-in-class performance goal remains active. This pass retained a small general body-reading simplification and rejected an inconclusive client execution refactor. It does not establish overall benchmark leadership.

## Retained change

`readFetchBody` returns native JSON, text and multipart body-reading Promises directly when no byte limit is configured, eliminating its redundant async wrapper. Byte reads convert the native buffer in a Promise continuation. Finite limits still use the same bounded reader and cancellation behavior. Synchronous clone failures remain Promise rejections. Existing defaults, validation, request preservation, supported representations and public return types are unchanged.

Three fresh processes per variant and runtime, alternating order, use seven batches of at least 40 ms, 1,000 warmup calls and 2,000 initial iterations. Frozen bundled source and fixtures isolate this comparison from concurrent edits. Values below are median process medians in microseconds per operation, not request latency percentiles. These are local Fetch round trips without sockets.

| Runtime | Scenario | Before µs | After µs | Change |
|---|---|---:|---:|---:|
| bun | static-get | 2.013 | 2.011 | -0.1% |
| bun | small-json-post | 3.625 | 3.528 | -2.7% |
| bun | large-json-post | 50.670 | 49.928 | -1.5% |
| bun | path-parameter-read | 3.564 | 3.610 | +1.3% |
| bun | query-header-read | 7.784 | 7.729 | -0.7% |
| bun | mixed-update | 7.462 | 7.369 | -1.3% |
| node | static-get | 6.586 | 6.535 | -0.8% |
| node | small-json-post | 11.616 | 11.567 | -0.4% |
| node | large-json-post | 77.429 | 75.951 | -1.9% |
| node | path-parameter-read | 9.168 | 9.136 | -0.4% |
| node | query-header-read | 12.849 | 12.741 | -0.8% |
| node | mixed-update | 16.563 | 16.514 | -0.3% |

Bun small POST improves 2.7%, versus a 1.0% improvement in its direct-Fetch control; mixed update improves 1.3%. GET is unchanged. This is modest evidence, not a universal gain. Node movements are comparable to direct-Fetch controls: its direct static/small/large cases improve 0.9%/0.7%/1.4%, respectively. No meaningful Node speedup is established. The change is retained as a small reduction in general body-reading overhead with no measured material regression; it is not a benchmark-specific dispatch path.

## Rejected experiment and profile

Inlining the no-middleware client transport/decoder Promise chain into the existing async execution frame produced small in-process gains but regressed Node static GET by 3.5%, versus only 0.7% movement in its direct control. That candidate was restored before the retained body-reader experiment. Error/cleanup regression tests remain: original decode errors survive disposal failures, disposal runs once, undeclared statuses reject before body consumption, and both middleware configurations preserve Promise behavior.

A five-second Node profile of small validated Fetch GETs mostly samples native Fetch work: body extraction about 6%, garbage collection about 6%, JSON byte parsing about 3.7%, stream state creation about 3.7%, and header materialization about 2.7%. These are sampled CPU percentages, not allocation measurements. Reducing general wrapper overhead is possible, but the profile does not justify skipping native transport semantics or contract guarantees to win tiny GET cases.

## Reproducibility and verification

[All raw batches, process medians, versions and executable hashes](2026-09-08-body-reader-performance.json) accompany this report. Frozen executables, compressed source snapshots and the CPU profile are retained in ignored `benchmarks/results/body-reader-2026-09-08/`, with rejected and retained candidates separated. Source trees are compressed to avoid accidental test discovery.

Workspace typechecks, tests, builds, dead-code analysis and public-export checks passed. Core now has 249 passing tests. Semantic preflight passed 63 policy operations and 36 focused fixture operations. Targeted formatting/lint and whitespace checks passed. New body-reader cases verify Promise rejection after body consumption and byte decoding with request preservation. The measured snapshots differ only in `adapters/web.ts`, and the retained source matches the measured candidate. All changes remain uncommitted; unrelated work was preserved.
