# Startup compilation performance — 8 September 2026

The preceding streaming turn made verified implementation and measurement progress. This pass profiles construction and removes redundant setup allocations. The broader best-in-class goal remains active.

## Evidence and retained changes

A five-second Node profile of repeated application creation and first calls showed approximately 18.6% garbage-collector samples, 6.9% in client definition creation, 4.0% in contract traversal and 3.1% in response-table compilation. This is sampled CPU evidence, not allocated-byte measurement or true process cold-start timing.

Contract traversal now extracts each declaration’s parameter names once and constructs inherited parameter sets only for routers that extend their scope. Leaf routes no longer allocate unused sets. Client controls are installed directly from property descriptors, removing the temporary controls object and its entries enumeration. Own non-enumerable/read-only controls, lazy route materialization, selection identity, validation timing and public APIs remain unchanged.

An additional shared response-table cache was tested and removed: it helped some combined client/server cases but regressed Node server-only setup consistently by about 3–4%. The rejected executable and original samples remain in the artifact directory. The retained implementation adds no new runtime cache.

## Construction and first request

Three fresh processes per variant on Bun 1.4.0 and Node 22.18.0, alternating before/after order. Each case builds a fresh contract and prepares all relevant routes before checking the first result. Client cases force every callable to materialize; lazy work cannot disappear from timing. Cases cover 1/32/256 dynamic routes, flat and parameterized-router nesting, and client/server/combined consumption. Seven batches of at least 60 ms follow 20 warmup applications. Numbers are median process medians of batch-average costs in microseconds, not request latency percentiles. Shared-machine variability remains.

[Raw samples, cold observations and hashes](2026-09-08-startup-performance.json) preserve all results. Frozen executable bundles, source archives, the CPU profile and rejected cache experiment are in ignored `benchmarks/results/startup-2026-09-08/`. Final snapshots differ only in the two retained source files.

| Host | Routes | Nested | Prepared side | Before → after µs | Change |
|---|---:|---|---|---:|---:|
| bun | 1 | False | client | 4.77 → 4.54 | -4.9% |
| bun | 1 | False | server | 6.42 → 6.16 | -4.1% |
| bun | 1 | False | both | 10.55 → 9.99 | -5.2% |
| bun | 32 | False | client | 147.65 → 138.81 | -6.0% |
| bun | 32 | False | server | 122.70 → 113.10 | -7.8% |
| bun | 32 | False | both | 182.74 → 172.96 | -5.4% |
| bun | 32 | True | client | 167.39 → 145.35 | -13.2% |
| bun | 32 | True | server | 158.83 → 152.96 | -3.7% |
| bun | 32 | True | both | 201.36 → 189.60 | -5.8% |
| bun | 256 | False | client | 1299.57 → 1247.66 | -4.0% |
| bun | 256 | False | server | 1043.33 → 997.13 | -4.4% |
| bun | 256 | False | both | 1659.80 → 1614.20 | -2.7% |
| bun | 256 | True | client | 1381.10 → 1351.14 | -2.2% |
| bun | 256 | True | server | 1261.32 → 1195.51 | -5.2% |
| bun | 256 | True | both | 1828.54 → 1684.59 | -7.9% |
| node | 1 | False | client | 7.04 → 6.82 | -3.2% |
| node | 1 | False | server | 13.63 → 13.66 | +0.2% |
| node | 1 | False | both | 19.30 → 19.41 | +0.6% |
| node | 32 | False | client | 196.76 → 165.90 | -15.7% |
| node | 32 | False | server | 138.97 → 135.37 | -2.6% |
| node | 32 | False | both | 230.70 → 220.16 | -4.6% |
| node | 32 | True | client | 186.10 → 174.60 | -6.2% |
| node | 32 | True | server | 163.96 → 154.40 | -5.8% |
| node | 32 | True | both | 254.91 → 241.96 | -5.1% |
| node | 256 | False | client | 1930.17 → 1752.02 | -9.2% |
| node | 256 | False | server | 1127.47 → 1072.77 | -4.9% |
| node | 256 | False | both | 2524.62 → 2383.36 | -5.6% |
| node | 256 | True | client | 1460.85 → 1414.11 | -3.2% |
| node | 256 | True | server | 1283.68 → 1256.70 | -2.1% |
| node | 256 | True | both | 2019.12 → 1944.39 | -3.7% |

Larger application construction improves approximately 2–16% in this local comparison. One-route Node server/combined results are effectively unchanged. Do not interpret the largest cell as a universal startup gain.

## Minimal application and actual process startup

A separate static one-route Fetch application rebuilds contract, server and client, then consumes a validated response. It uses 1,000 warmup applications and seven 60 ms batches in each of three processes. Results:

| Runtime | Before µs | After µs |
|---|---:|---:|
| bun | 7.520 | 7.282 |
| node | 17.331 | 17.615 |

Seven fresh process pairs per runtime also execute that bundled application once. The parent measures process launch until the checked-result line arrives on stdout; this includes process startup, bundle loading, native runtime initialization and pipe/scheduling overhead. It is not a measurement of separate installed-package ESM imports. Median times:

| Runtime | Before ms | After ms |
|---|---:|---:|
| bun | 26.499 | 26.114 |
| node | 46.729 | 47.613 |

These process timings do not establish a cold-start improvement; Node is slightly slower in this small sample. The defensible result is less construction overhead for larger applications. The combined browser client/server fixture grows from 51,240 to 51,246 minified bytes (+6) and from 15,798 to 15,807 gzip bytes (+9).

## Verification

Workspace typechecks/tests/builds, dead-code analysis and public-export checks passed. Core has 241 passing tests. Eight source/built consumer boundaries passed. Semantic preflight passed 63 policy operations and 36 focused fixture operations. Targeted formatting/lint and whitespace checks passed. New tests verify sibling parameter-scope isolation and preserve own immutable client controls, lazy materialization and stable selection identity. Measured source snapshots match the final retained files. Remaining gaps include minimal Node startup and small-response overhead. No claim of universal benchmark leadership is made. Changes remain uncommitted and unrelated work is preserved.
