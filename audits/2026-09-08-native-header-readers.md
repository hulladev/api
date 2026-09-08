# Targeted header reads across native adapters — 8 September 2026

The previous pass established targeted Fetch header reading. This pass extends the mechanism to Hono, H3, Elysia, Node HTTP, Express, Fastify and Koa. The shared-function implementation is retained.

## Architecture and correctness

Body media-type checks now use native single-header lookup in those adapters. Full header schemas retain complete normalized input. Node-based adapters share `nodeRequestHeader`/`nodeRequestHeaders`; Express and Fastify also use shared callback functions and per-dispatch input caches instead of per-request header-reader closures. Hono/H3/Elysia and Node HTTP/Koa retain their existing fresh full-record behavior while avoiding a second expansion for body checks. Readers are not shared mutable request state.

The shared Node normalizer now materializes a record with safe own keys. The previous implementation lost a literal `__proto__` header through ordinary assignment; the frozen baseline reproduction confirms `Object.hasOwn(result, '__proto__') === false`. The retained implementation preserves that field as data without changing the output prototype. Tests cover repeated values, empty values, inherited fields, pseudo-header filtering and source preservation. Express and Fastify now delegate full normalization to this helper too.

An initial closure-based integration was measured and superseded. Its raw samples and snapshot remain archived. No routing registration, body limit, validation policy, cancellation, parsed-body ownership, stream handling or public Promise return type changed.

## Independent metadata workloads

Each framework runs in its own process with the unchanged core Fetch adapter as a control. The workloads have content-type and tenant headers plus 0/8/32 unrelated 64-byte metadata values, with and without a header schema. Each call constructs a Request, executes a validated JSON route, consumes the response and checks its value. Three fresh before/after pairs per runtime use seven shuffled batches of at least 40 ms, 1,000 warmups and 1,000 initial iterations. Values are median process medians in microseconds, not latency percentiles. The normalized column compares median per-process native/core-Fetch cost ratios.

The 32-extra-header rows are shown below; every count and raw batch remains in the JSON.

| Runtime | Host | Header schema | Before µs | After µs | Raw change | Core-Fetch-normalized change |
|---|---|---|---:|---:|---:|---:|
| bun | Hono | false | 7.92 | 2.06 | -73.9% | -73.9% |
| bun | Hono | true | 14.15 | 8.33 | -41.2% | -42.3% |
| node | Hono | false | 15.37 | 11.68 | -24.0% | -25.0% |
| node | Hono | true | 17.15 | 16.13 | -5.9% | -5.6% |
| bun | H3 | false | 9.04 | 2.10 | -76.8% | -76.7% |
| bun | H3 | true | 16.10 | 9.25 | -42.6% | -42.9% |
| node | H3 | false | 17.77 | 12.39 | -30.3% | -30.7% |
| node | H3 | true | 21.02 | 18.69 | -11.1% | -12.8% |
| bun | Elysia | false | 9.04 | 2.06 | -77.2% | -77.4% |
| bun | Elysia | true | 16.31 | 9.51 | -41.7% | -42.4% |
| node | Elysia | false | 103.58 | 67.64 | -34.7% | -33.2% |
| node | Elysia | true | 127.27 | 101.62 | -20.2% | -11.8% |

Bun gains are large where native header expansion dominated. Node also benefits in the independent runs. Declared-header cases can improve because these adapters previously expanded headers again for the body media-type check. These are local native-framework round trips without a network, not universal production latency reductions. No specific metadata count is recognized by the implementation.

## Ordinary dispatch, adverse results and follow-up

The standard suite covers Hono/H3/Fastify static/dynamic dispatch and Express isolated handlers plus actual localhost HTTP round trips, with direct-host controls. Most movements are small; raw and control values are preserved. An initial retained-candidate Bun Express static HTTP row was 13% slower while its direct control moved about 4%. A separate five-pair follow-up, using 1,000 warmups and seven 100 ms batches, did not reproduce that regression: Hulla's median changed from 333.84 to 329.90 µs (-1.2%); direct Express changed from 329.77 to 328.61 µs (-0.4%). Do not compare the absolute costs across the two different measurement setups as an implementation gain. No general static-request speedup is claimed.

The first metadata suite instantiated all three native frameworks together. Node results were unstable, including large shifts in unchanged core-Fetch controls. Those pooled runs are archived but are not used to claim the retained gains. The independent framework runs follow the repository's established cohort approach and produced the table above. The cause of the pooled instability was not proved.

Node HTTP/Koa receive the shared-reader integration and conformance coverage; a standalone before/after throughput improvement for those two hosts was not measured here. Their expected reduction in header conversion work should not be presented as a measured end-to-end gain.

## Verification and reproducibility

Workspace typechecks, all 63 test tasks, builds, public export checks, dead-code analysis and documentation checks passed. Core has 261 passing tests. Semantic preflight passed 63 policy operations and 36 focused operations. Targeted lint/format and whitespace checks passed. Source comparison confirms that only the eight retained production files differ between frozen variants and that they match the current source byte for byte. Documentation describes the shared normalized readers. Only the eight measured production files, the normalization regression test and relevant documentation are changed in this pass; earlier and unrelated work is preserved.

[All samples, independent summaries, intermediate candidates, adverse observations and hashes](2026-09-08-native-header-readers.json) accompany compressed source/build snapshots and executable runners in ignored `benchmarks/results/native-header-readers-2026-09-08/`. The broader performance goal remains active; this report does not establish leadership in every supported workload.
