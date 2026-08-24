# Runtime benchmark matrix

This private workspace measures complete in-memory client-to-server calls without adding benchmark dependencies or code to the core package. It reports deliberately separate profiles for Direct Fetch, @hulla/api, tRPC, oRPC, ts-rest, and Hono RPC.

The first profile is a representative application matrix rather than an idealized static route. It measures:

- a resource read with two path parameters;
- a collection read with a path parameter, scalar and repeated query values, and a request header;
- a JSON update with two path parameters, query, headers, a body, and a validated response.

REST-oriented packages use those values as path/query/header/body fields. tRPC and oRPC carry the equivalent structured values through their native RPC protocols, so their rows measure idiomatic application cost rather than identical URL shapes. The application-mix summary uses a geometric mean of per-scenario ratios so no single high-latency scenario dominates the aggregate.

The historical strict-parity profile is reported first as the closest validation comparison. Each implementation follows its public boundary model:

- static JSON GET with server and client output validation;
- small JSON POST with request and response validation;
- large JSON POST with the same boundary behavior.

The native validated profile uses each package's simplest practical path while retaining its normally supported validation. The guarantees therefore differ and are reported as behavior, not as an equal-capability ranking:

| Runtime | Native request validation | Native response validation |
|---|---|---|
| Direct Fetch | Server receive | Client receive |
| @hulla/api | Server receive | Server send input validation + client receive |
| tRPC | Server receive | Server output |
| oRPC | Server receive | Server output |
| ts-rest + Zod 4 bridge | Server receive | Client receive |
| Hono RPC | Server receive through `zValidator` | Type-only |

Schemas use ordinary forward validation at inbound boundaries. A separate transformed-Date scenario measures an explicit core codec that preserves `Date` application values while encoding ISO strings at both HTTP send boundaries.

The separately labeled focused diagnostics compare @hulla/api with equivalent direct implementations for host-parsed adapter dispatch, static and parameterized dispatch through 256-route tables, server implementation construction and dispatch, dynamic path/query/header transport, client and server middleware/context, invalid-input serialization, codecs, and ten-chunk NDJSON streaming. They isolate @hulla/api feature costs and are not cross-package rankings. Those Fetch diagnostics exclude network and socket costs; `Direct Fetch` is the lower-level baseline rather than a competing contract library.

Adapter comparisons are split by integration shape. The native Express workloads cover direct Express, @hulla/api Express, ts-rest Express, tRPC's Express middleware, and oRPC's documented Node HTTP handler mounted as Express middleware. Registration is measured only for direct Express, @hulla/api, and ts-rest because those integrations register every REST route; tRPC and oRPC register one catch-all middleware and therefore do not perform comparable work. Adapter-isolated dispatch invokes the captured registered handlers for 256 static routes or procedures plus one validated dynamic operation. A separate real in-process HTTP tier traverses an actual Express router and loopback socket; it uses smaller 100-iteration batches and 25 warmup requests because the harness already repeats every batch to the same minimum sample duration. Fetch workloads use each package's public server adapter and native protocol. Next.js Route Handler cohorts cover direct Next.js, @hulla/api, ts-rest's App Router handler, tRPC's documented Fetch-based App Router handler, oRPC's Fetch handler, and Hono's Vercel/Next.js handler. TanStack Start server-route cohorts cover direct Start, @hulla/api, tRPC through a Start `Request` handler, and oRPC's documented Start integration. These are native-path comparisons, not claims of identical protocol semantics.

Benchmark code is organized by responsibility: `harness/` contains framework-neutral measurement, statistics, history, and reporting; `fixtures/` contains shared schemas, values, requests, and assertions; `adapters/` contains host integrations; `suites/` contains non-host-specific diagnostics; and `runners/` contains executable entry points.

Every adapter competitor runs in an independent process. A cohort contains its own direct host baseline, @hulla/api through that host adapter, and exactly one competitor through its documented adapter. Hulla samples are not reused or averaged across competitor cohorts. Results retain explicit `suite`, `adapter`, `phase`, `functionality`, `implementation`, and `protocol` dimensions.

Run the isolated adapter matrix with three repeated runs per fresh-process cohort (seven samples per run by default) using:

```sh
bun run --cwd benchmarks bench:adapters
```

Set `BENCH_RUNS` to override the repeated-run count. The command writes `benchmarks/results/adapters-latest.md` and `adapters-latest.json`. The JSON keeps cohort identity explicit; medians are never compared across cohorts.

The server implementation diagnostics use one four-route contract and compare an all-at-once root implementation, a single exhaustive route fragment passed directly to `createFetchHandler`, four independently deployable route fragments, and four fragments assembled through `server.implement(...fragments)`. Setup measurements include implementation and Fetch handler creation; route plans are warm after benchmark warmup. Dispatch measurements reuse the prebuilt handlers and the same target request. The raw route handler is a lower-bound reference and intentionally performs no routing or Fetch adaptation.

Run only these server implementation diagnostics with:

```sh
bun run --cwd benchmarks bench:implementations
```

A loaded-module first-call scenario reconstructs each framework's one-route contract/router, server adapter, and client before issuing its first validated request. It measures application construction after imports have loaded; it does not claim to measure process/module cold start.

The latest stable ts-rest release declares Zod 3 as a peer dependency, while this package uses Zod 4. Its benchmark therefore uses a plain ts-rest typed contract with explicit Zod 4 validation at the same four boundaries. The measured runtime path remains ts-rest's client and Fetch handler.

The benchmark is a separate private workspace and consumes the built `@hulla/api` package through its public exports. No benchmark code or competitor dependency is part of the core package.

Run the default benchmark from the repository root with:

```sh
bun run bench
```

Every invocation runs the application and diagnostic matrix three repeated times by default and appends its raw samples, package version, Git revision, and source fingerprint to `benchmarks/results/history.ndjson`, then runs the adapter cohorts independently. The fingerprint covers every package source file used by the workspace, the benchmark implementation, manifests, and the lockfile. Scenario/runtime order is independently shuffled for every sample. Each timed sample repeats batches until it lasts at least 20 ms, preventing sub-microsecond operations from being inferred from a 2–5 ms timing window.

The terminal remains the detailed live view. `benchmarks/results/latest.md` is the aggregated entry point: it includes the application and diagnostic report plus a compact summary of every independent framework-adapter cohort. Each summary row links to the corresponding section of `adapters-latest.md`, which remains the detailed independent adapter report. The main report opens with cross-package aggregate ratios for meaningful comparable cohorts, followed by every measured application or diagnostic operation. Each operation includes a concrete request or call-flow example, package or implementation medians with 95% confidence intervals, min–max ranges, direct and @hulla/api ratios, and exact changes from the previous compatible revision.

`benchmarks/results/latest.json` is the deterministic, schema-versioned snapshot for agents and other tools. Its flat result rows include every explicit query dimension, statistical summary, confidence interval, comparison, runtime identity, and sample count. Raw samples remain in `benchmarks/results/history.ndjson`, avoiding an ever-growing latest snapshot while preserving enough information for new statistical comparisons. Set `BENCH_JSON` to choose a different snapshot path.

Medians use deterministic non-parametric 95% bootstrap intervals. Prior-revision changes also include a 95% bootstrap interval. Package rows are compared as a ratio-of-ratios against the matching direct result in the same scenario, which compensates for machine-wide CPU drift between invocations. A result is only labeled faster or slower when its entire interval lies beyond the ±2% practical threshold; otherwise it is labeled negligible or inconclusive.

Compatibility requires the same runtime, host, OS, platform, architecture, CPU, iteration batch, minimum sample duration, and warmup count. Unrelated environments and old harness methodologies are never averaged together. Set `BENCH_HISTORY` or `BENCH_REPORT` to choose different output paths.

NDJSON is an append-only measurement log rather than a report cache. Each main-matrix invocation is one schema- and methodology-versioned record containing environment, source, configuration, explicit benchmark dimensions, and raw samples. Independent adapter cohorts stay in their dedicated snapshot so a repeated Hulla baseline cannot be mistaken for one shared cross-competitor sample. At the expected scale the history can be scanned in a few milliseconds and remains inspectable and recoverable without tooling.

The same run reports minified and gzip footprint in two separate tables:

- **Executable package comparisons** include each library's contract, validated client, server execution path, and in-memory Fetch transport. The `@hulla/api` row uses its root, client, server, and Fetch subpath exports; there is no separate Fetch package.
- **Tree-shaking checks** independently bundle contract-only, transport-neutral client-only, server-only and combined use, the Fetch client transport, the Fetch server adapter, the core adapter dispatcher, and the Express, Next.js, and TanStack Start adapters. They verify what each public import retains and are not additive component sizes or cross-package comparisons.

These are Bun-target production bundles with Zod externalized because it is shared, user-supplied validation code. They measure runtime code retained by representative imports rather than the size of the installed package directory. The complete @hulla/api Fetch scenario appears in both contexts: as the fair executable package comparison and as the 100% reference for tree-shaking percentages.

Generate a module-level report for that representative @hulla/api bundle with:

```sh
bun run analyze:size
```

The command writes two views in both Markdown and JSON:

- `benchmarks/results/bundle-analysis.*` is the authoritative public-package consumer build whose contributions add up to the measured artifact.
- `benchmarks/results/bundle-source-analysis.*` temporarily rewrites only the three @hulla/api imports to their source entry points, exposing contributions by `src/*.ts` file without maintaining a duplicate scenario.

Both views use the same minified, Zod-externalized scenario as the package-size benchmark. The source view is diagnostic; use the public-package view for size totals.

The repository check enforces a 48,000-byte minified and 14,600-byte gzip ceiling for the executable @hulla/api Fetch scenario, plus separate tighter ceilings for transport-neutral client/server use and the Fetch client transport. When an intentional feature needs more room, review the generated reports before raising a budget.

The defaults are three repeated runs, seven samples per run, batches of 5,000 measured iterations repeated to at least 20 ms per sample, and 1,000 warmup iterations. Comparatively expensive real-HTTP scenarios declare smaller batches and warmups, which are recorded per result in both JSON artifacts; the minimum sample duration remains unchanged. Override the defaults with `BENCH_RUNS`, `BENCH_SAMPLES`, `BENCH_ITERATIONS`, `BENCH_MIN_SAMPLE_MS`, and `BENCH_WARMUP`. Package versions are printed in the result table and locked by `bun.lock`.

Run the same bundled matrix on Node with:

```sh
bun run --cwd benchmarks bench:node
```

Bun performs only the TypeScript bundling step for that command; Node executes and is identified in the generated report. No benchmark accesses the internet. Most runtime calls are in-memory; the explicitly labeled Express HTTP tier uses only loopback sockets. Results should still be compared on the same machine and runtime, and the reported uncertainty should be used instead of treating a single percentage as exact.
