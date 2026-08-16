# Runtime benchmark matrix

This private workspace measures complete in-memory client-to-server calls without adding benchmark dependencies or code to the core package. It reports deliberately separate profiles for Direct Fetch, @hulla/api, tRPC, oRPC, ts-rest, and Hono RPC.

The equivalent-guarantee strict-parity profile is reported first because it is the closest feature-parity comparison. It applies the same applicable identity-schema boundaries to every implementation:

- static JSON GET with server and client output validation;
- small JSON POST with validation at all four client/server boundaries;
- large JSON POST with the same four validation boundaries.

The native validated profile uses each package's simplest practical path while retaining its normally supported validation. The guarantees therefore differ and are reported as behavior, not as an equal-capability ranking:

| Runtime | Native request validation | Native response validation |
|---|---|---|
| Direct Fetch | Server receive | Client receive |
| @hulla/api | Client send + server receive | Server send + client receive |
| tRPC | Server receive | Server output |
| oRPC | Server receive | Server output |
| ts-rest + Zod 4 bridge | Server receive | Client receive |
| Hono RPC | Server receive through `zValidator` | Type-only |

Identity schemas use ordinary forward validation at outgoing boundaries; they are not forced through Zod's reverse-codec path. A separate transformed-Date scenario measures genuine codec encode/decode work at all four boundaries.

The separately labeled focused diagnostics compare @hulla/api with equivalent direct implementations for host-parsed wire dispatch, dynamic path/query/header transport, client and server middleware/context, invalid-input serialization, codecs, and ten-chunk NDJSON streaming. They isolate @hulla/api feature costs and are not cross-package rankings. Network and socket costs are deliberately excluded; `Direct Fetch` is the lower-level baseline rather than a competing contract library.

A loaded-module first-call scenario reconstructs each framework's one-route contract/router, server adapter, and client before issuing its first validated request. It measures application construction after imports have loaded; it does not claim to measure process/module cold start.

The latest stable ts-rest release declares Zod 3 as a peer dependency, while this package uses Zod 4. Its benchmark therefore uses a plain ts-rest typed contract with explicit Zod 4 validation at the same four boundaries. The measured runtime path remains ts-rest's client and Fetch handler.

The benchmark is a separate private workspace and consumes the built `@hulla/api` package through its public exports. No benchmark code or competitor dependency is part of the core package.

Run the default benchmark from the repository root with:

```sh
bun run bench
```

The terminal output is intentionally compact. A full Markdown report with medians, throughput, ratios, minima, maxima, standard deviation, and every raw sample is written to `benchmarks/results/latest.md`. Set `BENCH_REPORT` to choose another report path.

The same run reports minified and gzip footprint for each minimal viable package solution. The @hulla/api entry includes its built-in Fetch client/server. These are Bun-target production bundles with Zod externalized because it is shared, user-supplied validation code. They measure runtime code retained by representative imports rather than the size of the installed package directory.

The defaults are seven samples, 5,000 measured iterations per sample, and 1,000 warmup iterations. Override them with `BENCH_SAMPLES`, `BENCH_ITERATIONS`, and `BENCH_WARMUP`. Benchmark order rotates between samples to reduce ordering bias. Package versions are printed in the result table and locked by `bun.lock`.

Run the same bundled matrix on Node with:

```sh
bun run --cwd benchmarks bench:node
```

Bun performs only the TypeScript bundling step for that command; Node executes and is identified in the generated report. Results should be compared on the same machine and runtime, with enough samples to see whether a difference exceeds run-to-run variance.
