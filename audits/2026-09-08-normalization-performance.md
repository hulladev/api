# Request normalization performance — 8 September 2026

The preceding goal turn made verified progress: adapter execution and compiled path rendering improved representative workloads. This pass profiles the remaining request-construction cost and reduces redundant header/query record construction. The broader performance goal remains active.

## Evidence and implementation

A five-second Node CPU profile of the query/header Fetch fixture attributed about 10.4% of samples to `setOwn` and 6.4% to garbage collection. Immediate callers of `setOwn` included outgoing query conversion (2.55%), incoming query grouping (2.27%), route capture (2.11%), parameter projection (1.95% combined), and the two header passes (0.75% each). Sampling is diagnostic evidence, not an allocation measurement.

Route headers now become one validated entries snapshot, consumed directly by the final merge. This removes an intermediate record and a second enumeration. Query encoding validates/copies entries and materializes one ordinary record. Incoming URL query values group in a Map before creating the schema-facing record. No request values, schemas or results are cached; no field-count or benchmark-name branches were added. Ordinary object prototypes, own prototype-named keys, header precedence/removal, codec execution, repeated query ordering and asynchronous snapshots are preserved.

The query work also fixes an existing correctness bug: decoding `constructor=one&constructor=two` previously produced an array containing the inherited Object constructor before the two strings. The frozen baseline reproduces this; the new accumulator produces exactly the two strings. Regression coverage includes `__proto__`, `constructor`, `toString`, empty/repeated values and array ownership.

## Controlled measurements

Three fresh processes per variant on Bun 1.4.0 and Node 22.18.0, alternating order. Snapshots differ only in the three normalization files, on top of the preceding architecture pass. Main comparisons retain seven batches of at least 40 ms with 1,000 warmup operations. Scaling uses seven batches of at least 60 ms and 1,000 warmup operations. Tables report median process medians in microseconds; these are batch-average costs, not request p95/p99. Shared-machine noise remains.

[All samples, controls and bundle hashes](2026-09-08-normalization-performance.json) are retained. Executable frozen bundles, initial header-only experiments, source snapshots and the CPU profile are in the ignored `benchmarks/results/normalization-2026-09-08/` directory.

| Case | Bun before → after µs | Change | Node before → after µs | Change |
|---|---:|---:|---:|---:|
| @hulla/api / application / query-header-read | 7.444 → 7.570 | +1.7% | 12.624 → 12.059 | -4.5% |
| @hulla/api / application / mixed-update | 7.076 → 7.125 | +0.7% | 15.742 → 15.848 | +0.7% |
| @hulla/api / native / static-get | 1.917 → 1.982 | +3.3% | 6.399 → 6.205 | -3.0% |
| @hulla/api in-process / strict-parity / static-get | 0.683 → 0.676 | -1.0% | 0.578 → 0.571 | -1.2% |
| @hulla/api in-process / native / static-get | 0.672 → 0.691 | +2.9% | 0.587 → 0.569 | -3.0% |
| @hulla/api in-process / application / query-header-read | 2.871 → 2.756 | -4.0% | 3.242 → 2.967 | -8.5% |
| @hulla/api in-process / application / mixed-update | 2.793 → 2.622 | -6.1% | 3.357 → 3.079 | -8.3% |
| @hulla/api in-process / focused / dynamic-http | 2.070 → 1.960 | -5.3% | 2.565 → 2.356 | -8.1% |
| @hulla/api in-process / focused / codec-roundtrip | 1.634 → 1.645 | +0.7% | 2.470 → 2.414 | -2.3% |
| @hulla/api / focused / dynamic-http | 5.351 → 5.500 | +2.8% | 10.756 → 10.288 | -4.4% |
| @hulla/api / focused / middleware-context | 2.602 → 2.678 | +2.9% | 6.503 → 6.417 | -1.3% |
| @hulla/api / focused / codec-roundtrip | 4.297 → 4.350 | +1.2% | 13.187 → 13.054 | -1.0% |

## Scaling

Each operation supplies 1, 8 or 32 headers and query fields, with repeated and Unicode query values. Portable rows measure client request construction/response handling through a trivial validating transport, not an in-process server. Fetch rows include both client and server validation and request/response creation, with a 204 response. Every operation checks its values.

| Host | Fields in each collection | Path | Before → after µs | Change |
|---|---:|---|---:|---:|
| bun | 1 | portable | 0.412 → 0.345 | -16.2% |
| bun | 1 | fetch | 2.825 → 2.876 | +1.8% |
| bun | 8 | portable | 1.371 → 0.989 | -27.8% |
| bun | 8 | fetch | 10.240 → 9.694 | -5.3% |
| bun | 32 | portable | 4.931 → 3.374 | -31.6% |
| bun | 32 | fetch | 39.549 → 37.243 | -5.8% |
| node | 1 | portable | 0.776 → 0.581 | -25.0% |
| node | 1 | fetch | 3.939 → 3.854 | -2.2% |
| node | 8 | portable | 3.027 → 1.852 | -38.8% |
| node | 8 | fetch | 12.410 → 10.669 | -14.0% |
| node | 32 | portable | 12.148 → 7.385 | -39.2% |
| node | 32 | fetch | 46.376 → 39.004 | -15.9% |

Small Bun Fetch cases are neutral or slightly slower; do not hide those rows behind larger wins. Larger metadata collections improve consistently in this local comparison. This pass changes request normalization, so it makes no new claims about streaming tails, network capacity or large JSON payloads. The prior load/lifecycle results remain evidence for the earlier executor change, not a new load comparison for normalization.

## Verification and remaining work

Workspace typechecks, all tests, builds, dead-code analysis and public-export checks passed. Core has 234 passing tests. Eight source/built consumer boundaries passed. Semantic preflight passed 63 policy operations and 36 focused fixture operations. Targeted formatting/lint and whitespace checks passed. Archived benchmark sources are compressed so workspace test discovery cannot execute them.

The combined browser Fetch fixture changes from 51,136 to 51,235 minified bytes and from 15,758 to 15,790 gzip bytes (see raw size measurements for the exact recorded values).

A fresh three-process public-package Fetch comparison is retained alongside the frozen experiments, with run ID `b9a38c92-8264-4969-b534-2209c41fa25f`. Hulla leads tRPC/oRPC in all three aggregate cohorts, is approximately level with ts-rest/Hono in representative and equivalent-policy cohorts, and trails Hono by about 11% in the native aggregate, where output-validation guarantees differ. Individual gaps remain: mixed updates trail ts-rest, small responses trail Hono, and loaded-module construction plus first request costs 9.62 µs versus 6.04 µs for ts-rest and 4.44 µs for Hono. Do not infer an improvement from comparing this fresh report with older incompatible workload snapshots.

The next architectural candidates are layered streaming execution and setup-time compilation/allocation. They need their own profiles and correctness-preserving comparisons. The requested overall performance target is not yet proven; this goal remains active. Changes remain uncommitted, and unrelated edits are preserved.
