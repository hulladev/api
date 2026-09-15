# Implementation and verification

The agreed core, authoring, transport, test and benchmark changes are implemented. The original review is preserved in `2026-09-07-codebase-review.md`; migration instructions are in `../docs/migration.md` and host differences in `../docs/adapter-conformance.md`.

## Authoring and core

- `defineClient()` returns an executable immutable scope. `.use()` derives scopes, `.select()` returns independently callable fragments, and `.compose()` assembles complete coverage. The terminal `.create()` step is removed. Top-level subtrees materialize on first access; this is deferred construction, not automatic JavaScript code splitting.
- Server `.implement()` binds handlers; `.compose()` joins fragments. Handlers may return fewer than all declared statuses. Missing routes, undeclared statuses and invalid bodies remain errors.
- Root authoring names are checked at runtime and in types. Named type-only contract/router metadata fixes declaration emission for inferred clients and nested fragments without adding runtime code.
- Execution uses one sync/async vocabulary and guarded concurrent field startup. Path substitution segments are compiled once. Shared empty contexts are frozen and middleware plans use named fields.

## Lifetime, responses and adapters

- Failed response decoding disposes owned responses. Concurrent asynchronous header decoding requests a cancellable body reader; synchronous headers and ordinary JSON/text responses retain native buffered readers. This avoids the substantial regression found during implementation measurements.
- Stream bridges close producers on invalid chunks, disconnects and IPC shutdown. Node, Express and Fastify use the shared request-lifetime helper; Node and Express also share response writing/backpressure handling. Fetch, H3, Hono and Elysia share native response writing and bounded body reading.
- Native serialization errors and late stream failures reach the shared writers' error hook. Observer failures do not recurse. Replacement works before commitment; late hooks are observational.
- Portable request signals reach middleware, context and handlers. Native body preservation is explicit. Owned readers enforce byte limits, and NDJSON/SSE decoders bound records across chunks and UTF-8 boundaries. Host-parsed bodies retain host/platform limits.
- In-process FormData and singleton/repeated query semantics now match the portable contract without URL/JSON roundtrips. Response headers normalize case and preserve repeated cookies.
- TanStack Query/SWR accept cache prefixes. Actual cache tests cover structural key identity, namespace separation and scoped invalidation/mutation. Types exclude authoring controls and preserve the underlying route result types.

## Verification

`bun run check` passes: formatting, lint, documentation vocabulary, dead-code analysis, all workspace typechecks, runtime/harness tests, framework builds, package builds/publint, built core imports, downstream declaration emission and size budgets. The SolidStart production-build test is additionally verified directly with the newer available Node binary; the default Node 22 invocation skips that one build test.

New regression coverage exercises real mixed async/sync failures, serialization observer failures, locked response cancellation, all supported transport representations, Unicode paths, multipart/query behavior, actual chunked HTTP limits, real Node/Fastify disconnects, concurrent context isolation, native-router overlap behavior, and consumer declaration emission. Existing useful type and behavior coverage is retained; documentation policy is moved out of the core runtime suite.

## Benchmarks and tradeoffs

The primary report uses idiomatic configurations and retains their different guarantees. Equivalent-policy measurements remain separate. Preflight checks actual validation counts, rejected validators and semantic outputs. Main and adapter runs launch separate processes and retain raw batch groups/process identities. Workload/product/environment provenance governs history and report assembly; raw changes accompany direct-normalized changes.

The added diagnostic suite covers route/middleware/payload scaling, closed-loop concurrency and independently scheduled HTTP load, request latency distributions and failures, delayed/slow-consumer streaming and cancellation, IPC, cold processes, flat/nested TypeScript consumers, declaration size and browser-target bundles. CI runs deterministic checks on every change and offers weekly/manual measurement artifacts. Shared-machine timing is evidence, not a hard performance gate or proof of universal leadership.

This is not a blanket bundle-size or speed win. Safety and authoring features add retained code. Bounded Fetch body reads also add real work compared with unbounded native buffered parsing; the default benchmarks retain that cost. The local before/after spot checks show modest in-process improvements and modest Fetch GET overhead, not a universal throughput claim. An early streaming-reader implementation caused a large Fetch regression and was corrected before completion.

The original revision used for the spot check and size comparison is `1548d29aae0607371feb541e87f3abbc36463e56`. Original built size fixtures measured 45,895 / 14,202 bytes (minified / gzip) for the executable Fetch client+server and 28,934 / 9,327 for transport-neutral client+server. New thresholds explicitly allow the added features; they are documented in `../benchmarks/README.md`.

Final run measurements and artifact identity follow below.

## Final measurements

Run ID: `bc8cb18c-cde8-46ac-abe3-76d396a2a321`. All four artifact families were verified against the same product, workload, methodology and environment identity.

- 89 main operations; 34 independent adapter cohorts. Three fresh processes per repeated comparison, five timed batches per operation.
- 12 diagnostic processes, 111 rows; zero offered-load failures in these local runs.
- Both flat and nested TypeScript consumers at 10/100/1,000 routes typechecked and emitted declarations.
- Browser-target schema-free executable Fetch client: 28,977 minified / 9,593 gzip bytes.

| Built fixture | Before minified / gzip | After minified / gzip |
|---|---:|---:|
| @hulla/api | 45,895 / 14,202 | 49,887 / 15,426 |
| Transport-neutral client + server | 28,934 / 9,327 | 29,934 / 9,684 |
| Fetch client transport | 2,807 / 1,303 | 3,548 / 1,596 |

The focused before/after GET check retained raw samples in `before-after-core.json`. It is deliberately separate from the new comparative benchmark baseline. Values below are medians of process medians; these small local samples do not establish production throughput.

| Transport | Server middleware layers | Before µs | After µs | Change |
|---|---:|---:|---:|---:|
| inprocess | 0 | 1.984 | 1.837 | -7.4% |
| inprocess | 5 | 2.305 | 2.179 | -5.5% |
| fetch | 0 | 3.273 | 3.607 | +10.2% |
| fetch | 5 | 3.634 | 4.062 | +11.8% |

In this check, in-process execution improved by approximately 5–7%; Fetch GET cost increased by approximately 0.3–0.4 µs (10–12%). The broader suite retains bounded POST reading and all default validation costs. Those costs are real and should inform follow-up optimization; no blanket speed or size improvement is claimed.

Local reports: [main matrix](../benchmarks/results/latest.md), [native adapters](../benchmarks/results/adapters-latest.md), [load/lifecycle/types/bundles](../benchmarks/results/diagnostics-latest.md). Generated reports remain ignored by Git; the implementation and this handoff report are uncommitted workspace changes.


## Fetch and bundle optimization follow-up

The figures above remain the original implementation baseline. Subsequent directional-compilation, bounded-reader and response-serialization changes are measured separately in [fetch-optimization-results.md](fetch-optimization-results.md), with raw samples and reproducible fixture source in the accompanying JSON artifact.
