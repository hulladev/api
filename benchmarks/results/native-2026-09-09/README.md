# Native declarations and request preparation — 9 September 2026

This pass removes the client-wide validation policy. Runtime work follows the contract declaration:

```ts
request.json<Input>()           // static types, native JSON
response.json<Output>()         // static types, native JSON
response.json(outputSchema)     // explicit validation and declared transforms
response.json(outputCodec)      // explicit bidirectional conversion and validation
```

Type arguments alone do not validate application data. Malformed JSON still fails native parsing. In-process transport passes values directly, without simulating JSON serialization. Explicit schemas still execute on their existing boundaries; their guarantees were not weakened to improve benchmarks. `responseValidation` and codec `decodeTrusted` support have been removed.

Static configured headers are captured and normalized at client construction; use a headers function for values that change per call. Path rendering prepares literal segments and parameter names once. Server calls with no middleware invoke the handler directly within the same lifecycle, and middleware error callbacks are shared instead of allocated per request. No extra executor, cache, or configuration mode was introduced.

The query-copy experiment was dropped because it changed the prototype and undefined-field behavior of the public transport object. Native Fetch callback signatures and streaming ownership were retained; the profile does not justify changing these APIs merely to move costs between layers.

## Verification

`bun run check` passed, including all workspace types, tests, builds, packed-package roundtrips, runtime-host smoke tests, and size checks. The core suite has 273 passing tests. New coverage verifies typed native JSON, malformed JSON rejection, explicit schema validation, and static versus dynamic headers. Existing codec, transformation, cancellation, disposal, and middleware lifecycle tests pass.

## Matched source diagnostic

Bun 1.4.0, same-process before/after source imports, 3,000 warmup calls per case, seven alternating-order samples of 10,000 calls. Values are median batch-average microseconds per operation, not network latency. The baseline is the completed rewrite immediately before this pass. Native JSON uses a 20-number array; other rows retain explicit schemas and result checks.

| Workload | Before | After | Change |
|---|---:|---:|---:|
| fetch/native-json | 4.133 µs | 3.470 µs | -16.0% |
| fetch/health | 2.026 µs | 2.045 µs | +0.9% |
| fetch/update | 5.908 µs | 5.903 µs | -0.1% |
| inProcess/native-json | 1.623 µs | 1.068 µs | -34.2% |
| inProcess/health | 0.924 µs | 0.913 µs | -1.3% |
| inProcess/update | 2.196 µs | 2.097 µs | -4.5% |

[Raw samples](./source-comparison.json). Native JSON improves because the redundant recursive preflight is gone; runtime shape validation is now an explicit schema choice. Schema-validated Fetch results are essentially unchanged in this diagnostic. The smaller in-process improvement is indicative, not a statistically established production gain.

The [built-package suite](./fetch.md) ran separately across three independent processes with five samples each, 3,000 iterations and 1,000 warmup iterations, at least 20 ms per sample. Existing benchmark validation policies are unchanged. See [raw results](./fetch.json) and [run history](./history.ndjson).

## Bundle size

Same retained consumer fixtures; schema library externalized. Each row is an independent bundle, not an additive component.

| Fixture | Previous gzip | Current gzip |
|---|---:|---:|
| @hulla/api | 14.18 KiB | 14.04 KiB |
| Transport-neutral client | 7.14 KiB | 6.97 KiB |
| Core adapter dispatcher | 4.88 KiB | 4.92 KiB |

Core source decreased from 6,820 to 6,779 lines. [Size data](./package-size.json), [provenance](./size-provenance.json), and [source contribution analysis](./bundle-analysis.md).

## Profile and remaining costs

A short CPU sample of 150,000 built-package mixed-update calls places native JSON reading (9.1% self time), Request construction (7.7%), object copying (4.9%), and field execution (4.9%) among the largest costs. These are approximate samples, not an allocation profile or isolated causal measurements. Inclusive field-execution time includes validation and other descendants and must not be counted as helper overhead. [CPU profile](./cpu-profile.md).

The bundle analysis identifies contract construction, the Fetch client, server implementation binding, and response handling as substantial retained modules. Moving files alone will not remove them. Further changes should target measured work and preserve native cancellation and representation behavior; this pass does not claim to have resolved every validated-path or bundle-size bottleneck.
