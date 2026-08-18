# Runtime benchmark matrix

This private workspace measures complete in-memory client-to-server calls without adding benchmark dependencies or code to the core package. It reports deliberately separate profiles for Direct Fetch, @hulla/api, tRPC, oRPC, ts-rest, and Hono RPC.

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

The separately labeled focused diagnostics compare @hulla/api with equivalent direct implementations for host-parsed wire dispatch, static and parameterized dispatch through 256-route tables, dynamic path/query/header transport, client and server middleware/context, invalid-input serialization, codecs, and ten-chunk NDJSON streaming. They isolate @hulla/api feature costs and are not cross-package rankings. Network and socket costs are deliberately excluded; `Direct Fetch` is the lower-level baseline rather than a competing contract library.

A loaded-module first-call scenario reconstructs each framework's one-route contract/router, server adapter, and client before issuing its first validated request. It measures application construction after imports have loaded; it does not claim to measure process/module cold start.

The latest stable ts-rest release declares Zod 3 as a peer dependency, while this package uses Zod 4. Its benchmark therefore uses a plain ts-rest typed contract with explicit Zod 4 validation at the same four boundaries. The measured runtime path remains ts-rest's client and Fetch handler.

The benchmark is a separate private workspace and consumes the built `@hulla/api` package through its public exports. No benchmark code or competitor dependency is part of the core package.

Run the default benchmark from the repository root with:

```sh
bun run bench
```

Every run appends its raw samples, package version, Git revision, and source fingerprint to `benchmarks/results/history.ndjson`. The terminal and `benchmarks/results/latest.md` aggregate all compatible runs, reporting median, mean, coefficient of variation, throughput, ratios, extrema, standard deviation, and sample count. They also compare each stable benchmark identity with the most recent compatible prior source revision, even when the displayed package version changed; negative median changes are faster and positive changes are slower. Compatibility requires the same runtime, host, OS, platform, architecture, CPU, iteration count, and warmup count, so unrelated environments are never averaged together. Set `BENCH_HISTORY` or `BENCH_REPORT` to choose different output paths.

NDJSON is an append-only measurement log rather than a report cache. At the expected scale it can be scanned in a few milliseconds, remains inspectable and recoverable without tooling, and preserves enough metadata for version trends. A database becomes useful only if history grows large enough to require interactive ad hoc queries or concurrent writers; the file schema can be imported into one without changing benchmark records.

The same run reports minified and gzip footprint for each minimal viable package solution. The @hulla/api entry includes its built-in Fetch client/server. These are Bun-target production bundles with Zod externalized because it is shared, user-supplied validation code. They measure runtime code retained by representative imports rather than the size of the installed package directory.

The defaults are seven samples, 5,000 measured iterations per sample, and 1,000 warmup iterations. Override them with `BENCH_SAMPLES`, `BENCH_ITERATIONS`, and `BENCH_WARMUP`. Benchmark order rotates between samples to reduce ordering bias. Package versions are printed in the result table and locked by `bun.lock`.

Run the same bundled matrix on Node with:

```sh
bun run --cwd benchmarks bench:node
```

Bun performs only the TypeScript bundling step for that command; Node executes and is identified in the generated report. Results should be compared on the same machine and runtime, with enough samples to see whether a difference exceeds run-to-run variance.
