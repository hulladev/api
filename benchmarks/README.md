# Benchmark methodology

Run `bun run bench` from the repository root to build public exports and run the complete measurement pipeline. The pipeline copies built workspace packages and benchmark fixtures into a temporary private workspace, remaps workspace dependency links to that copy, and writes results back to this repository. Concurrent edits and rebuilds after that snapshot cannot change the measured code. Installed third-party dependencies remain shared; do not reinstall dependencies during a run. The temporary workspace is removed on completion or failure. The suite leads with each package's recommended everyday configuration. An extra validation pass, protocol envelope, batching behavior or roundtrip imposed by that API is part of its measured cost. We do not manually add redundant outgoing validation to competitors to make them perform like this package.

## Profiles and guarantees

| Profile | Input policy | Output policy | Interpretation |
|---|---|---|---|
| Recommended everyday setup (`native`) | Idiomatic server-side validation where declared | Each package's practical default; client/output guarantees differ | Primary comparison, with differences retained |
| Representative application requests | Paths, query, headers and JSON body through the native API | Server output and client output validation | REST and RPC retain their own protocol representation |
| Equivalent validation policy (`strict-parity`) | Server input validation, no manually added client input validation | Server and client output validation | Separate comparison for applications requiring these checks |
| Focused diagnostics | Explicit fixture-specific policy | Explicit fixture-specific policy | Explains costs; not a cross-package league table |

In the native fixtures, @hulla/api validates output on both server and client, tRPC/oRPC on the server, and direct Fetch/ts-rest on the client. The minimal Hono fixture has no output schema validation.

The native fixture output validation count is two for @hulla/api, one for direct Fetch/tRPC/oRPC/ts-rest, and zero for the minimal Hono fixture. Equivalent-policy output validation is two. Input-bearing primary scenarios validate server input once. The preflight enforces these observed counts rather than relying only on table labels. Ordinary @hulla/api schemas expose outbound input types; explicit codecs additionally encode application values. Fetch-owned request readers now enforce a default 1 MiB limit. Host-native parsers retain their own limits. This behavior and its real cost remain in the default measurements.

`bun run --cwd benchmarks preflight` runs actual operations in a separate, untimed process. It verifies validation counts, deliberately rejects each configured boundary to detect validators that are called but ignored, and executes the focused fixtures' semantic assertions. The instrumentation wrapper is absent during timed execution. Native adapters also execute their own payload/status assertions in every measured operation. Timings include the fixture's client consumption and assertions; they are not raw handler-only timings unless explicitly labeled.

## Fetch and in-process coverage

The report pairs both @hulla/api transports for every everyday use case: static GET, small and large JSON POST, path parameter reads, query/header reads, and mixed updates. Basic requests appear in both native and equivalent-policy profiles; representative requests use the application profile. Both paths share the contract, implementation, validation and result assertions. Focused path/query/header, Date codec and streaming cases also show both transports. Fetch-specific middleware context, serialized HTTP errors and raw adapter dispatch keep their actual execution-path labels.

Fetch here is an in-memory Request/Response roundtrip including HTTP encoding and JSON serialization. In-process passes values directly. The paired table makes this transport difference visible; cross-package rankings retain the Fetch path as their reference. In-process details are separate from host adapter measurements. Socket load, framework injection, raw HTTP body reading and HTTP-specific feature diagnostics remain labeled by the path they actually exercise.

## Measurement units and provenance

Main and native adapter suites launch a fresh process for each repeated run. Batches within that process share warmup, clients and handlers. Raw batches, per-run groups and process identities are retained. The main table reports the median **batch-average cost per operation**, not individual-request p50/p95/p99. Its sequential operations/sec is reciprocal average cost, not maximum server throughput. Confidence intervals and change comparisons use run-level samples; fewer than three samples cannot produce a clear regression verdict.

Reports show raw changes alongside direct-normalized changes. Normalization can compensate for machine drift but can also hide changes affecting both the direct and library paths. It is supporting evidence, never a reason to suppress raw regressions.

Snapshots carry a run ID, runtime/OS/CPU/host, methodology version, built-product fingerprint and workload/dependency fingerprint. The product fingerprint covers public built JavaScript, declarations and package manifests, matching the exports loaded by the suite. Editing unbuilt source does not invalidate a measurement; rebuilding the measured copy during a run does. Standalone runners measure the current workspace directly and therefore still reject concurrent rebuilds. Errors identify which input changed. Product changes can be compared historically only when workloads and environment remain compatible. Per-scenario iteration/warmup settings participate in history keys. Report assembly requires matching product/workload/environment provenance, and appending an adapter report additionally requires the same run ID. Bundle snapshots have their own provenance. Changed fixtures or lockfiles intentionally start a fresh baseline.

## Load, lifecycle and scale

`bun run --cwd benchmarks bench:diagnostics` measures:

- Route tables with 1/32/256/2,048 routes, deterministic broad hits, 404s, method misses and middleware depths 0/1/5.
- Paired Fetch and in-process JSON roundtrips of approximately 1 KiB, 16 KiB, 256 KiB and 1 MiB, with serialized byte counts recorded. This payload sweep disables the Fetch body limit explicitly so the 1 MiB value plus its JSON envelope fits; ordinary request benchmarks retain the default limit.
- Actual localhost Node HTTP at concurrency 1/16/64, plus independently scheduled 100/1,000/5,000 requests/sec sweeps. Scheduled, dispatched and completed timestamps expose scheduling and queue delay. Timeouts count as failures.
- MessagePort roundtrips with small/64 KiB messages and concurrency 1/16, including endpoint teardown.
- Delayed streams with slow consumers, first-chunk/cancellation timing, completion, invalid input, handler failure and abort paths. Producer finalization is checked.
- Fresh-process imports, construction and first response, separately from the existing loaded-module setup diagnostic.
- Real 10/100/1,000-route TypeScript consumers: compiler time, memory, instantiations and declaration emit size.
- A browser-target executable Fetch client, alongside existing retained-size measurements. The browser fixture is schema-free and includes all imported core/transport code. Existing package-comparison bundles externalize Zod; do not compare those numbers as total application sizes.

Raw individual-request distributions, failures, RSS, heap deltas, event-loop utilization and event-loop delay are preserved. Heap delta is not allocated-byte count or proof of a leak. Event-loop histograms have 10 ms resolution; very short measurements are not informative. Localhost offered-load sweeps are useful regression diagnostics, not production capacity predictions.

## Running and reviewing results

Useful controls are `BENCH_RUNS`, `BENCH_SAMPLES`, `BENCH_ITERATIONS`, `BENCH_WARMUP`, `BENCH_MIN_SAMPLE_MS`, `BENCH_DIAGNOSTIC_REQUESTS` and `BENCH_LOAD_DURATION_MS`. `BENCH_REPORT`, `BENCH_JSON` and `BENCH_HISTORY` choose the main artifact paths. Use a complete invocation to assemble related reports; standalone adapter runs keep their results separate.

Artifacts are written to `results/latest.md`, `latest.json`, `history.ndjson`, `adapters-latest.*`, `diagnostics-latest.*` and `package-size.*`. Generated measurements are ignored by Git; preserve the full artifacts with provenance when publishing a claim.

Every PR runs semantic preflight, behavior/type checks, built imports and bundle measurements. The performance workflow is manual and weekly. It can target a dedicated runner label; shared hosted runners are report-only evidence. Make a regression decision only after reproducing a material change on the same controlled machine, checking uncertainty and an absolute latency/memory budget. Never let an aggregate win conceal failed cleanup or a tail-latency regression. The suite does not claim unmeasured feature parity or universal leadership.

## Bundle measurements during development

`check:size` builds the consumer fixtures and records minified and gzip sizes, including provenance. It fails on broken builds, but does not enforce fixed size caps while the architecture is evolving. Review size changes alongside functionality, runtime performance, and the actual entrypoints a consumer imports. Small increases are acceptable when their architectural or performance benefit is demonstrated.

The original built executable Fetch fixture measured 45,895 minified / 14,202 gzip bytes; transport-neutral client+server measured 28,934 / 9,327. Lifecycle, repeated-header and bounded-reader behavior added code. Subsequent directional compilation reduces client-only and adapter-only bundles while the combined client+server fixture retains both directions. See `../audits/fetch-optimization-results.md` for paired measurements and tradeoffs.

The scaling diagnostics now include chunked JSON request reading at 256-byte, 16 KiB and 256 KiB payload sizes, with 1 KiB and 64 KiB chunks. Bounded (1 MiB) and native unbounded readers are labeled separately because their guarantees differ. Each operation consumes a fresh stream and checks the parsed value; request construction and stream delivery are included in timing.


## Consumer dependency boundaries

`bun run check:exports` includes `check-boundaries.ts`. It builds seven realistic source and public-package consumers for browser/Node targets, inspects retained module contributions, and executes the client/server call fixtures. These checks prevent Fetch/HTTP implementation leakage into non-Fetch consumers and Node helper leakage into browser bundles, without fixed byte caps. Source checks identify individual implementations; public-build checks exercise the distributed entrypoints and reject external package dependencies (Node builtins are allowed only in the Node consumer). Positive fixtures verify that the expected Fetch and Node implementations are actually retained when selected.


MessagePort diagnostics and size fixtures consume the separate `@hulla/api-message-port` package. The boundary checks reject a core dependency on that package and verify that other consumers do not retain its implementation. Built-package smoke tests exercise a real MessageChannel roundtrip and downstream declaration emission.
