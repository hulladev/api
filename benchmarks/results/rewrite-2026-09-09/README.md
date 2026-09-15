# Core rewrite review — 9 September 2026

The rewrite establishes the agreed contract-first boundaries and passes the complete repository checks. It does **not** recover all pre-cleanup performance or achieve parity with Hono and ts-rest on every workload.

## Architecture delivered

- `createClient(contractOrSelection, { transport, middleware, context })` returns a plain endpoint tree or route function. Client builders, scoped selection controls, and recomposition are removed.
- Selected contract nodes expose immutable `$contract` metadata containing their structural keys, inherited route manifest, and errors. Declarations can be reused at different mounts. Runtime selection no longer requires a private node registry.
- Server implementations expose immutable handler bindings. HTTP adapters and direct in-process dispatch share one selected-route lifecycle. In-process calls select by key and pass encoded parameters without URL matching.
- Synchronous validation, encoding, and handlers stay synchronous inside the asynchronous public lifecycle. There are no separate sync/async HTTP executors or single-route specialization paths.
- Ordinary Standard Schemas remain the default. Optional codecs provide explicit bidirectional conversion. Response validation defaults to `validate`; `trust` skips only codecs' separate wire checks and retains decoding and application validation.
- Client route identity is fixed before middleware. Headers remain mutable. Middleware lists are captured at construction, and context remains per call.
- Integrations, public-export checks, benchmark fixtures, documentation, and lifecycle tests use the new API. Historical audit documents remain labeled as history.

## Verification

`bun run check` passed after the final code changes: formatting, lint, documentation vocabulary, dead-code checks, workspace typechecking, tests, builds, public-export checks, packed-package consumers and roundtrips, runtime-host smoke tests, and size checks. The core suite contains 270 passing tests. Coverage includes cancellation, disposal, asynchronous validation failures, middleware ordering, selected-client inherited types, portable manifests/bindings, and trust semantics.

## Built-package performance

Final built exports; Bun 1.4.0; three independent processes; five samples per process; 3,000 iterations and 1,000 warmup iterations, with at least 20 ms per sample. Values below are median batch-average microseconds per operation. These are in-memory Fetch roundtrips, not network latency or production throughput. Native configurations retain the packages' different validation guarantees. Application workloads validate server and client output.

| Workload | @hulla/api | ts-rest | Hono |
|---|---:|---:|---:|
| static-get | 2.41 | 2.92 | 1.72 |
| small-json-post | 3.96 | 4.07 | 3.01 |
| large-json-post | 50.28 | 43.13 | 44.30 |
| path-parameter-read | 4.63 | 4.16 | 4.28 |
| query-header-read | 8.87 | 8.39 | 7.99 |
| mixed-update | 8.39 | 6.91 | 8.21 |

See the [complete report](./fetch.md) for confidence intervals, validation profiles, in-process results, and bundle comparisons. The [raw snapshot](./fetch.json) and [run history](./history.ndjson) record samples and build/workload provenance. Trust mode was not used to obtain these results.

## Original, first cleanup, and rewrite comparison

A separate same-process source diagnostic ran the same schema-validated calls against three source snapshots in alternating order: 3,000 warmup calls followed by seven 10,000-call samples. The mixed-input POST uses parameters, query, headers, and a JSON body; it is a different fixture from the built-package `mixed-update` above. These numbers describe local diagnostic medians, without independent-process confidence intervals.

| Transport / workload | Original | First cleanup | Rewrite | Rewrite vs cleanup |
|---|---:|---:|---:|---:|
| fetch/health | 1.787 µs | 2.493 µs | 2.138 µs | -14.2% |
| fetch/update | 5.266 µs | 5.640 µs | 6.044 µs | +7.2% |
| inProcess/health | 0.635 µs | 1.285 µs | 1.009 µs | -21.5% |
| inProcess/update | 1.696 µs | 2.357 µs | 2.349 µs | -0.3% |

[Raw source-comparison samples](./source-comparison.json). The original snapshot is from HEAD `525aaadd`; the cleanup snapshot was captured before this rewrite. Negative change means lower cost.

## Remaining limits

Simple calls recover part of the cleanup regression. Mixed-input Fetch calls remain slower than both earlier snapshots; in-process mixed-input cost is essentially unchanged from the first cleanup. The results do not support calling the performance work finished.

The complete Fetch client/server fixture retains about 14 KiB gzip, compared with roughly 6 KiB for ts-rest and 9 KiB for Hono in this suite. Core source is 6,820 lines across 60 files: nearly unchanged from the first cleanup's 6,813 lines, and below the original 7,529 lines. The principal gain of this pass is simpler public composition and execution boundaries, not a dramatic second reduction in source or bundle size.

The next performance decisions should address parameter marshalling and Fetch boundary overhead, with the same validation policy, and client bundle retention. They should be justified by these workloads rather than reintroducing specialized per-route executors.
