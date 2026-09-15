# Rejected native response writer experiment — 8 September 2026

The preceding adapter measurement turn provided concrete evidence of remaining gaps. This pass tests a general synchronous response-writing primitive shared by Express and Node HTTP. The production candidate was rejected and restored; two public writer regression tests remain.

## Candidate and result

The candidate added `writeNodeResponseStep`, returning immediately for buffered bodies and awaiting streams/HEAD cleanup, while preserving the public Promise-returning `writeNodeResponse` wrapper. Express and Node HTTP awaited the writer only when it returned asynchronous work. JSON serialization still preceded header commitment, and transport/error handling stayed in the host adapters. No validation or lifetime checks were removed.

Three fresh before/after process pairs per runtime used frozen built workspace packages, external third-party dependencies and the same Express fixtures. Variant order alternated. Seven shuffled batches of at least 40 ms followed 1,000 warmup calls; the existing HTTP fixtures override that with 25 warmups and 100 initial iterations. Values below are median process medians in microseconds per operation, not request latency percentiles. Direct Express and ts-rest controls remain in the raw results.

| Runtime | Hulla scenario | Before µs | Candidate µs | Change |
|---|---|---:|---:|---:|
| bun | adapter-static-dispatch | 1.588 | 1.523 | -4.1% |
| bun | adapter-dynamic-dispatch | 2.240 | 2.236 | -0.1% |
| bun | express-http-static-roundtrip | 59.820 | 60.834 | +1.7% |
| bun | express-http-dynamic-roundtrip | 71.160 | 69.565 | -2.2% |
| node | adapter-static-dispatch | 3.864 | 4.177 | +8.1% |
| node | adapter-dynamic-dispatch | 6.369 | 6.038 | -5.2% |
| node | express-http-static-roundtrip | 142.747 | 130.183 | -8.8% |
| node | express-http-dynamic-roundtrip | 173.199 | 170.236 | -1.7% |

Bun isolated static dispatch improves about 4%, but dynamic dispatch is flat. Node isolated static dispatch regresses about 8%, versus 4.4%/3.7% movement in its direct/ts-rest controls. Node dynamic dispatch improves 5.2%, but its direct control improves 6%. Node static HTTP improves 8.8%; other HTTP results are mixed and controls also move. These measurements do not establish a sufficiently broad, reliable benefit to retain a new public adapter primitive. The three candidate production files were restored from the before snapshot only after checking their current bytes still matched the measured candidate.

This result rejects writer-only splitting; it does not prove that broader compiled execution changes cannot help. Any subsequent route-execution experiment should measure the entire boundary and its complexity instead of assuming fewer Promise frames automatically means better production performance.

## Retained safety coverage and verification

The new public-API tests verify that invalid JSON serialization rejects a Promise before touching headers or ending the response, and that a HEAD stream waits for asynchronous producer cleanup without pulling any data. These tests apply to the original writer too and do not assert the discarded implementation.

The first workspace test run timed out in an unrelated OpenAPI compilation test at its five-second limit. A rerun with reduced concurrency passed all 63 workspace tasks without changing that test or its timeout. After restoration, workspace typechecks, all 63 test tasks, builds and public export checks passed; core has 251 passing tests. Dead-code analysis initially found an Astro fixture left by the interrupted first test run. Its creation timestamp matched that run; removing that generated fixture allowed the check to pass. Targeted lint/format and whitespace checks passed. All three restored production files match the before snapshot byte for byte.

[Raw batches, process medians, controls, versions and artifact hashes](2026-09-08-node-writer-performance.json) accompany frozen before/candidate source/build archives and executable runners in ignored `benchmarks/results/node-writer-2026-09-08/`. No existing benchmark reports or unrelated changes were overwritten. The broader performance goal remains active.
