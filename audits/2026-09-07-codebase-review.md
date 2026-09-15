# Codebase review — 2026-09-07

Reviewed revision: `1548d29`, initially clean working tree. Focus: active core, Fetch/in-process/MessagePort transports, Node/Express adapter implementation, selected native adapter tests, query integration design, benchmark fixtures/harness/history, and test organization. Legacy is reference material, not part of the active review. This is a review and refactor proposal; production code has not been changed. This is not an exhaustive certification of every framework adapter or OpenAPI feature.

The contract → compiled plan → executor → adapter architecture is worth retaining. Its separation, explicit codecs, native router integration, status-discriminated results, and weakly keyed compilation caches are useful. The immediate opportunity is to make failure/lifecycle behavior as deliberate as the successful hot path. Current benchmark comparisons cannot establish best-in-class performance: some comparison paths do more validation, and measurements describe sequential average operation cost rather than loaded service behavior.

## Verified findings

### 1. P1 — Partially started validation can escape as an unhandled rejection

Evidence: `packages/core/src/adapters/input.ts:86`, `adapters/response.ts:170`, `client/request.ts:173`; the same construction pattern occurs in `contract/parameters.ts` and `contract/input.ts`.

Operations are called while constructing an array, or before calling `Promise.all`. If an earlier operation returns a rejecting promise and a later operation throws synchronously, execution never reaches the promise aggregator. The earlier rejection is orphaned. This is different from multiple promises rejecting *after* attachment to `Promise.all`, which is safe.

Reproduced with an async rejecting header schema plus a synchronously throwing body schema: the dispatcher returned 500 **and** emitted `unhandledRejection`. Confirmed on Bun 1.4.0 and Node 22.18.0. Ordinary schema issue results can also become synchronous throws through `validationValue`, so the risk is not limited to validators that explicitly throw.

Fix: centralize safe composition of sync-or-async operations. Either evaluate sequentially with sync-preserving continuation, or attach rejection handling as each operation starts and guarantee that previously started work is observed if later startup throws. Choose sequencing based on measured mixed-request cost. Do not suppress meaningful failures indiscriminately or wrap every synchronous step in a microtask just to simplify the implementation.

Regression: exercise sync success/failure and async success/failure in *different fields*, both field orders, across client encoding, server input, response headers/body, and inherited parameter groups. Use an isolated child process for the unhandled-rejection assertion.

### 2. P1 — Fetch serialization is outside the advertised error boundary

Evidence: `packages/core/src/fetch/server.ts:206`; `adapters/runtime.ts` only surrounds semantic execution and response preparation.

`toResponse()` runs after `dispatch()` finishes. A value that passes its declared schema but cannot be JSON serialized, an invalid native header, or a mismatched raw Response rejects the Fetch handler without invoking its configured `onError`. Reproduced with a cyclic value accepted by a custom Standard Schema: handler rejected, hook calls = 0, on both runtimes.

Node's final write failures similarly go to `transportFailure()` without its configured adapter hook; Express forwards them to host `next(error)`. Host behavior may legitimately differ, but the adapter hook's scope needs to be explicit and consistent.

Fix: distinguish semantic response preparation from native response construction/writing. Route native failures through a response/transport phase while a fallback can still be sent. Once streaming headers are committed, notify the error observer and terminate the stream; attempting to replace an already-started response is not viable. Define what happens if the error hook itself fails, with no recursive invocation.

Regression: invalid JSON serialization, raw status mismatch, invalid header, rejected error hook, and failure after the first streamed chunk. Assert both client-visible outcome and observation count.

### 3. P1 — Stream and rejected-response cleanup is incomplete

Evidence: `packages/core/src/fetch/server.ts:96`, `client/creation.ts:54`, `client/response.ts:191`, `client/request.ts:35`, `message-port/server.ts` (`pump` catch).

The Fetch stream bridge calls `controller.error()` when a yielded chunk has the wrong type, but never calls the source iterator's `return()`. Reproduced with a generator containing `finally`: the response fails and `finally` does not execute. MessagePort's pump also deletes active state on an invalid chunk/send error without closing its iterator.

Separately, when the client rejects a response for unexpected status or content type, it has no transport-neutral disposal operation. Reproduced a content-type mismatch against an open Fetch body: the call rejects, but the stream's cancel callback is never called. The MessagePort client installs stream state before core decoding; a rejection before `readBody()` likewise has no general release path.

Fix: give transport responses explicit ownership and an idempotent `dispose(reason)`/`cancel(reason)` capability. Core must release a response rejected before ownership is handed to the caller. Successful raw/stream responses transfer ownership to the application. Ensure producer cleanup runs on invalid chunks, early consumer return, read/write error, abort, endpoint close, and setup failure. Returning a partially consumed response inside an error may be a supported inspection feature, but it must have an explicit disposal contract.

For Node/Express direct streams, also test disconnect while awaiting the *next* producer item: their direct `for await` paths have no equivalent of the raw Fetch reader's close cancellation. An iterator `return()` alone cannot interrupt arbitrary pending producer work; pass a cancellation signal to cooperative producers.

### 4. P2 — In-process FormData responses always fail default MIME validation

Evidence: `packages/core/src/in-process/index.ts:46`; `adapters/response.ts` removes multipart content type so Fetch can generate its boundary.

A route returning `response.formData()` works through Fetch and rejects through in-process with `Expected response content type multipart/form-data, received none`. Confirmed on Bun and Node. MessagePort already synthesizes the media type for this representation.

Fix: preserve semantic representation metadata independently of native multipart framing, or supply the appropriate semantic media type in the in-process response. Test every declared body representation against all applicable transports, including empty/raw differences. The two current in-process tests do not cover this.

### 5. P1 for benchmark conclusions — Validation work is not equivalent

Evidence: `benchmarks/direct-fetch.ts:217`, `trpc.ts:146`, `hulla-api.ts:89`, `fixtures/scenario.ts` (`encodeValue`), and `packages/core/src/client/request.ts`.

`encodeValue()` calls `schema.parse()`. Direct Fetch and tRPC strict-profile POSTs call it before sending; their server input and server/client output boundaries then validate too. The equivalent ordinary-schema `@hulla/api` client does not validate outgoing body input; it serializes it and lets the server validate it.

For the simple POST case, Direct Fetch/tRPC perform four schema passes versus three for `@hulla/api`. Application-profile tRPC calls also explicitly validate outgoing params/query/headers/body, whereas core ordinary inputs only undergo representation checks before server validation. This is a real workload difference, not timer noise. The harness partly acknowledges different guarantees, but the `strict-parity` identity and README's closest-parity presentation remain misleading.

Fix: declare and verify each benchmark's validation policy. Provide a genuinely equivalent policy cohort and a separate idiomatic-default cohort. Remove extra manual client validation from comparators where the matched policy omits it, or explicitly add it to every participant. Validate outcomes *and boundary invocation counts* in an untimed preflight. Do not change product semantics merely to improve ranking.

Changing validation policy creates a new benchmark methodology/scenario version. Existing results should remain historical, not become a baseline for the corrected workload.

### 6. P2 — History compatibility overlooks per-scenario workload changes

Evidence: `benchmarks/harness/history.ts:269` and `:392`.

Compatibility checks global iterations/warmup/minimum duration and environment. `resultKey()` uses profile, scenario, and runtime identity. It does not check the per-result iteration/warmup overrides already stored in the file. A changed HTTP-specific batch can therefore be compared with an older batch as if it were equivalent. Likewise, changed fixture semantics are simply a new source fingerprint and can be selected as the previous comparison.

Fix: keep separate fingerprints for product source and benchmark methodology/workload. Include scenario-specific settings, fixture policy/version, and dependency/competitor identity in comparison compatibility. A changed implementation is what we want to compare; changed measurement work is a new baseline. Add history tests for both accepted and rejected comparison cases.

### 7. P2 — Adapter snapshots lack sufficient provenance

Evidence: `benchmarks/runners/adapters.ts:38`, `benchmarks/fetch-roundtrip.ts:57`.

The standalone adapter snapshot stores generated time, configuration, and cohorts, without the main history's environment and source fingerprint. The main runner imports any existing adapter snapshot without verifying provenance. The default combined command refreshes adapter results afterward, but standalone main/Node runs or an interrupted adapter run can present a fresh main report containing old adapter rows.

Fix: give all runs a source/environment/workload identity and run ID; verify compatibility before combining reports. Write a run's outputs together, or mark incompatible/older sections clearly. Preserve per-process/per-run samples and uncertainty in adapter reports as well as headline ratios.

## Design changes worth considering

These are recommendations rather than measured performance wins.

### A. Make request lifetime portable; make raw body preservation explicit

`adapters/runtime.ts` decodes input before context and middleware. Native Fetch context causes every declared body to be read from `request.clone()`, even when context only reads a request ID header. That keeps an unread original body branch alive unnecessarily. Neither the large-body benchmark nor the simple middleware scenario exercises their combination.

Introduce a portable execution context with `signal` and route metadata, and an explicit body-access policy. A native context declaration should not implicitly request an extra body copy. Allow applications to opt into replay/raw-body access where needed, including signature verification. Measure bytes retained with a large streamed request and a context that only reads headers.

Also make ordering deliberate: current server middleware cannot reject an unauthenticated request before body decoding. Keep typed application middleware after validation, but provide/document a host or pre-decode authentication boundary. Do not silently move existing middleware and change its guarantees.

### B. Define transport equivalence precisely

In-process bypasses JSON serialization and query URL round-tripping. A query schema requiring an array accepts `{ tags: ['admin'] }` in-process but fails through Fetch, where one repeated value becomes a scalar. Reproduced on both runtimes. Singleton normalization is explicitly delegated to schemas in existing tests; this is a documented design limitation, not a newly discovered violation of that rule.

However, the query “round-trip” test hands the encoded record directly to the decoder, and the benchmark uses exactly two roles. Both avoid the lossy transport step. Test absent/single/repeated fields through actual URLs and across transports. Either normalize in-process through the same semantic wire rules or clearly distinguish a fast local-call mode from a wire-equivalent mode.

Provide a validator-neutral declaration/helper for repeated query fields if uniform single-item arrays are a product goal. Standard Schema alone does not identify which properties are arrays, so avoid schema-vendor introspection.

### C. Unify lifecycle utilities without hiding host behavior

Node HTTP and Express duplicate header writing, raw Response streaming, drain waiting, representation switching, and cancellation code. Their direct and raw paths already differ in cleanup. Extract a small Node-only writer/lifecycle utility with explicit host operations; keep registration, parser selection, native context, and host error handling inside each adapter. Avoid a single generic adapter superclass.

Native routing also differs from catch-all routing. Core intentionally gives a static path precedence before selecting its method (`adapter-runtime.test.ts:221`). Native hosts own their own matching and HEAD behavior; Node maps HEAD to GET while Fetch currently dispatches HEAD directly. Publish a conformance table and decide which differences are supported. Test overlapping static/parameter paths across methods rather than assuming public route declarations guarantee identical selection everywhere.

### D. Relax exhaustive handler status requirements

`server/handlers.ts` requires inferred handler returns to include **every** declared route status. A contract describes possible results, not proof that every implementation must emit all of them. This makes a narrower deployment, rollout, mock, or implementation delegating failure to middleware harder to express and encourages return-type widening.

Keep exhaustive *route coverage* and rejection of *undeclared statuses*. Remove the requirement that every handler return union mention every declared status, or make it an optional authoring check. This simplifies a recursive conditional-type layer and improves normal handler reuse. Prove the change with positive and negative type fixtures, including fragments and declared errors.

### E. Separate selection, binding, and composition names

`server.implement()` currently means bind a full tree, bind one node, or compose fragments. `client.create()` similarly builds, selects, or composes, with runtime branding distinguishing overloads.

A concrete possible API:

```ts
const server = defineServer(contract, { context })
const users = server.implement(contract.routes.users, userHandlers)
const implementation = server.compose(health, users)
const client = defineClient(contract, { transport }).create()
const selected = clientDefinition.select(contract.routes.users)
const composed = clientDefinition.compose(publicClient, privateClient)
```

The largest clarity gain is explicit `compose`; keeping `implement(node, handlers)` is reasonable. A thin `createClient(contract, options)` convenience can cover the common no-builder case without replacing the scoped builder. Avoid a broad cosmetic rename of `route`, `response`, `codec`, or native adapter names: they already communicate useful concepts.

Internally, use one `ExecutionStep`/mapping vocabulary instead of the forwarding `SchemaStep`, `isSchemaStepAsync`, and `mapSchemaStep` layer where it adds no schema-specific behavior. Keep specialized schema execution plans. Consider named fields for `MiddlewarePlan`'s positional tuple; this is setup data and readability is more valuable than unmeasured tuple savings.

### F. Support real response-header and cache-key requirements

Core response headers are a string record. Native raw Response adapters preserve multiple Set-Cookie values, but a normal typed response cannot represent the equivalent header list cleanly. Normalize case once and represent repeated response headers explicitly, with a lossless adapter conversion. Test multipart Content-Type handling with mixed casing and repeated cookies.

TanStack Query/SWR integrations derive keys from only the traversed client property path plus input. Two API clients with the same route names produce the same keys; no prefix option is exposed despite prefix generics in the types. Add an explicit namespace/key factory and tenant/session scoping guidance. Test two clients and auth-scope changes in one actual cache. Keep declared-error return-versus-throw behavior explicit so applications deliberately choose what their data layer considers a failed operation.

### G. Optimize construction work that is still repeated per call

`compilePathParameterEncoder()` eventually splits/maps/joins the same static path for every invocation. Compile literal segments and substitutions once, and fast-path a single parameter group if measurements justify it. Keep percent encoding and prototype-safe property writes.

Client response decoding introduces multiple async wrappers even for in-process synchronous values. After fixing ownership and composition, try sync-preserving internal decoders while keeping the public client promise API. Measure actual in-process workloads and concurrent HTTP workloads; a faster isolated call is insufficient justification if complexity or loaded behavior worsens.

Freeze shared empty server/procedure context records as the client already does, to avoid cross-call mutation through JavaScript escape hatches. This is cheap consistency, not a flagship optimization.

## Test audit and replacement priorities

The suite is not generally full of tautologies. Typed contracts, fragment scoping, duplicate detection, transformed schemas, hostile property names, native context checks, and MessagePort cancellation are valuable coverage. Keep those. Identity/cache tests can also protect a deliberate allocation property, but should be described as internal regression tests rather than user behavior.

The gaps are mostly combinations, ownership, and real boundaries:

| Priority | Behavior | Meaningful oracle |
|---|---|---|
| First | Mixed sync/async failure | One reported failure, no unhandled rejection, no handler execution |
| First | Invalid output/native serialization | Correct fallback before commit, exactly one error notification |
| First | Stream abort, invalid chunk, disconnect, endpoint close | Producer finalized, listeners/pending calls released, no further pulls |
| First | Cross-transport representation matrix | Same semantic result for supported kinds, explicit exceptions |
| First | Concurrent tenant/request contexts | No shared auth, headers, input, or response state |
| Next | URL query/parameter boundaries | Unicode/encoded delimiters, absent/single/repeated fields, malformed encodings |
| Next | Slow/oversized input and unterminated stream records | Defined limit, bounded buffering, early termination |
| Next | Host router conformance | Documented 404/405/HEAD and static/dynamic method behavior |
| Next | Public package consumer | Built export imports work and inferred types survive declaration emission |
| Next | Query integrations | Actual cache invalidation, key separation, cancellation, chosen error policy |

Node HTTP buffers all request chunks then allocates another complete body; no body-size option is present. Fetch body helpers and NDJSON/SSE line accumulation are likewise unbounded at this layer. Add configurable limits where this package owns reading; where the host owns parsing, document and test the host setting. Test chunked bodies with no Content-Length, not only declared oversized lengths. These are stability requirements that schema validation after full buffering cannot provide.

Use a shared adapter conformance suite for common semantics, with explicit capability exclusions; keep a small number of actual host/router/socket tests to verify integration behavior. Mocked adapters are useful for extraction logic but cannot establish backpressure or routing fidelity. Use pairwise combinations for routine coverage and targeted full matrices for failure ownership.

Type tests are product tests for this library. Keep `expectTypeOf` and negative `@ts-expect-error` fixtures; run TypeScript as a separate required check. Vitest passing alone does not establish type correctness. Add packed/built consumer fixtures and realistic large contracts so recursive type usability is measured.

Move `documentation.test.ts` into a dedicated documentation lint task. It scans all workspace Markdown from a core unit test, currently fails on 18 lines, and can scan unrelated audit/legacy material. Its root documentation inputs are also outside the core package's normal Turbo package input boundary. Preserve any desired vocabulary rule, but scope it correctly and stop counting it as core stability coverage.

`adapter-package-exports.test.ts` checks manifest key spelling, not whether the exports actually import. Keep it only as a policy check; supplement it with built-package consumer imports rather than expanding string assertions.

Benchmark tests currently check statistics/reporting and selection of synthetic cohort rows. Add actual fixture preflight: counters at each validation boundary, semantic payload assertions, malformed input/output, singleton repeated query, and checks that competitors perform the same declared work. A cohort with the right labels can still benchmark the wrong behavior.

## Benchmark plan

### What the current suite does well

It consumes public built package exports, separates native and focused profiles, retains raw samples, randomizes measurement order, enforces a minimum sample duration, uses direct baselines, and avoids comparing registration work that catch-all RPC adapters do not perform. Its application matrix is broader than a health-route-only benchmark. Keep these investments.

### What current numbers actually mean

The harness runs `await benchmark.run()` sequentially, divides total time by iterations, and then computes statistics over those batch averages. The reported median is a median **average cost per operation**, not the median of individually timed request latencies. `ops/sec` is the reciprocal of that cost at concurrency one, not measured maximum service throughput. Its min/max/CI cannot establish request p95/p99 or bound stalls within a batch.

Three repeated runs reuse the same process, constructed clients, and handlers in the main matrix. Adapter cohorts do use fresh processes, but repeated samples within each cohort are not independent process launches. Preserve run/process boundaries rather than flattening all samples before bootstrapping; report within-process and between-process variation. Drift-normalized ratios should accompany raw changes, since normalization can hide a change affecting both direct and library work.

The 256-route diagnostic always hits route 255 in regular `/static/N` or `/dynamic/N/:id` tables. This is a useful hot-route diagnostic, not a route-scaling curve. The large JSON case has 100 small fixed-shape items. Streaming has ten immediately available chunks. Middleware has one layer. None establishes behavior across realistic working sets or sustained load.

### A practical four-tier suite

| Tier | Workloads | Metrics and use |
|---|---|---|
| Semantic preflight | Every timed implementation; matching valid/invalid request and response behavior | Exact output, validation count/policy, cleanup; required before timing |
| Core diagnostics | Construction, binding, decode/encode, matcher, middleware, response selection | ns/op or µs/op, allocations where measurable; explain costs and regressions |
| Application load | Actual sockets plus idiomatic clients; controlled arrival rates and concurrency | Completed requests/sec, p50/p95/p99, failures/timeouts, CPU, RSS/heap, event-loop delay |
| Lifecycle/scale | Slow producers/consumers, abort storms, long streams, large contracts, cold processes | Time to first chunk, delivery latency, cancellation latency, bounded retained memory, setup/typecheck/import cost |

Proposed workloads, expanded deliberately rather than taking the Cartesian product of everything:

- Route counts 1, 32, 256, 2,048; mixed depths/static/parameter paths; deterministic hot and broad distributions; hits, 404s, and method misses.
- Small and approximately 16 KiB, 256 KiB, and 1 MiB JSON payloads, recording actual serialized bytes; varied optional fields and shape distributions. Separate schema cost from framework cost.
- A realistic mix of reads/writes and occasional validation failures; middleware depths 0/1/5; header-only authentication context combined with large bodies; sync handlers plus controlled asynchronous work.
- Concurrent clients at several fixed concurrency levels and an independently scheduled offered-load sweep. Record scheduled arrival and completion times so overload waiting is visible; do not derive saturation throughput from a sequential loop.
- Streaming with delayed items, slow readers, long records split at varied byte offsets, UTF-8 boundaries, early cancellation, and failure after headers.
- In-process and MessagePort calls with concurrency and representative payload sizes, including IPC serialization and resource cleanup.
- Fresh-process import + contract construction + first call, separate from existing loaded-module first-call measurement.
- TypeScript consumer fixtures with small and large nested contracts: compiler wall time, peak memory, and declaration size; editor responsiveness requires a separate measurement if claimed.
- Browser-target bundles alongside existing Bun-target retained-size budgets, with actual import-smoke verification. Keep transport-only and client-only budgets separate.

For competitor comparisons, publish the supported capability/policy matrix next to results and keep protocol differences explicit. Include feature-native scenarios such as batching only as separately labeled cohorts when supported; do not retrofit identical REST URLs onto RPC implementations just to claim parity. Select workload weights before looking at winners, show every scenario, and retain absolute values alongside geometric aggregates.

For CI, run semantic preflight and deterministic behavior/type/size gates on every PR. Run the small performance suite on a controlled runner, and longer load/lifecycle sweeps periodically or for relevant changes. Gate on repeatable material regressions with uncertainty and an absolute budget, not an arbitrary tiny percentage on shared CI. Never use an aggregate win to hide a cancellation leak or a large p99 regression.

## Suggested implementation order

1. Fix async composition, serialization observation, response disposal, stream cleanup, and in-process FormData. Add reproductions as focused regression tests.
2. Correct validation policy and history/provenance before producing another comparative performance baseline.
3. Add cross-transport/adapter conformance, concurrent isolation, and body/stream limits; separate documentation policy checks from runtime tests.
4. Introduce portable lifetime/cancellation and explicit native body preservation; evaluate repeated-header support and cache namespaces.
5. Simplify handler status typing and composition overloads using representative application/type fixtures.
6. Measure path-template compilation and sync-preserving decoder changes against corrected diagnostic and load workloads. Keep only improvements that survive broader workloads.

## Verification performed

- Core runtime suite: **204 passed, 1 failed**, 25 files. Failure: documentation vocabulary, 18 reported lines across Astro/Nuxt/SvelteKit docs.
- Core TypeScript check: **passed**.
- Benchmark harness/cohort tests: **10 passed**.
- Node HTTP tests: **5 passed**, with actual loopback access.
- Express tests: **8 passed**, with actual loopback access.
- Fastify/Hono/H3 selected suites: **14 passed** combined.
- Root `bun run test`: stopped on the same core documentation failure; remaining workspace suites were not certified.
- Standalone reproductions on **Bun 1.4.0 and Node 22.18.0** confirmed orphan rejection, bypassed Fetch error hook, unclosed invalid-chunk producer, unreleased rejected Fetch body, in-process FormData failure, and singleton-query transport divergence.
- No full timing matrix was rerun: correcting workload equivalence is necessary before treating new ratios as evidence. No performance improvement is claimed from this review.

An initial ad hoc root-level Vitest invocation also matched a legacy test and hit sandbox loopback restrictions. Those are invocation/environment issues, not counted as active-code failures. Node/Express were rerun successfully in the correct scope with loopback enabled.
