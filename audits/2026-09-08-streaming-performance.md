# Streaming execution performance — 8 September 2026

The previous normalization turn made verified code and measurement progress. This pass addresses per-record async layering while preserving streaming semantics.

Line parsing and NDJSON/SSE framing now run within one asynchronous decoder. Previously every line crossed an async generator boundary before framing, including SSE control and blank lines. A synchronous callback performs framing inside the chunk-reading loop. Schema values are yielded directly, using the async generator’s Promise assimilation, and synchronous server validation no longer adds an unconditional await. Public stream APIs and custom formats are unchanged.

Byte limits, UTF-8 buffering, CR/LF/CRLF handling, SSE multiline/event limits, lazy parsing, upstream iterator closure and backpressure remain. No records are cached, no validation is skipped and no chunk-size-specific execution branches were introduced.

## Measurements

Three fresh processes per variant on Bun 1.4.0 and Node 22.18.0 in alternating order. Each operation consumes 64 records and checks their sequence and Unicode values. Seven batches of at least 50 ms follow ten warmup operations. Pure decoding varies chunk sizes; complete Fetch calls validate every record on server and client with synchronous or asynchronous schemas. Values are median process medians of batch-average costs, not individual-request percentiles. Shared-machine variability and modest warmup limit precision.

[Raw samples and hashes](2026-09-08-streaming-performance.json) include unfavorable rows. Frozen executable bundles, lifecycle raw results and compressed source snapshots are retained under the ignored `benchmarks/results/streaming-2026-09-08/` directory. Source snapshots differ only in the three streaming files.

| Host | Operation | Format | Input | Before → after µs | Change |
|---|---|---|---|---:|---:|
| bun | decode | ndjson | 1-byte chunks | 235.93 → 237.58 | +0.7% |
| bun | decode | ndjson | 64-byte chunks | 38.38 → 35.56 | -7.3% |
| bun | decode | ndjson | 4096-byte chunks | 34.33 → 31.87 | -7.2% |
| bun | fetch | ndjson | sync schemas | 102.89 → 97.69 | -5.0% |
| bun | fetch | ndjson | async schemas | 104.18 → 102.47 | -1.6% |
| bun | decode | sse-json | 1-byte chunks | 320.09 → 321.67 | +0.5% |
| bun | decode | sse-json | 64-byte chunks | 59.12 → 53.23 | -10.0% |
| bun | decode | sse-json | 4096-byte chunks | 51.45 → 45.68 | -11.2% |
| bun | fetch | sse-json | sync schemas | 116.81 → 107.83 | -7.7% |
| bun | fetch | sse-json | async schemas | 135.69 → 107.85 | -20.5% |
| node | decode | ndjson | 1-byte chunks | 357.31 → 368.83 | +3.2% |
| node | decode | ndjson | 64-byte chunks | 45.09 → 34.11 | -24.4% |
| node | decode | ndjson | 4096-byte chunks | 37.95 → 27.52 | -27.5% |
| node | fetch | ndjson | sync schemas | 150.55 → 139.89 | -7.1% |
| node | fetch | ndjson | async schemas | 152.39 → 133.96 | -12.1% |
| node | decode | sse-json | 1-byte chunks | 481.44 → 478.53 | -0.6% |
| node | decode | sse-json | 64-byte chunks | 91.83 → 72.30 | -21.3% |
| node | decode | sse-json | 4096-byte chunks | 81.31 → 63.52 | -21.9% |
| node | fetch | sse-json | sync schemas | 179.27 → 159.47 | -11.0% |
| node | fetch | sse-json | async schemas | 178.52 → 155.58 | -12.9% |

Normal-sized chunk decoding improves about 7–27% in these measurements; complete Fetch streams improve about 2–20%. One-byte chunks are mostly unchanged, with Node NDJSON approximately 3% slower. Do not extrapolate the largest improvement to all streams. Tiny chunks remain dominated by source iteration and chunk decoding.

## Lifecycle and footprint

Three additional process pairs per runtime ran existing slow-consumer/producer diagnostics with 50 operations per case, including full consumption, cancellation, handler failure, invalid input and abort. All semantic and producer-finalization assertions passed. Raw first-chunk/cancellation timings are retained. These short delayed-stream diagnostics are correctness/regression evidence, not proof of production tail-latency gains. Empty timing arrays are recorded as unavailable rather than zero.

The combined streaming browser client/server fixture grows from 52,668 to 52,716 minified bytes (+48) and from 16,280 to 16,304 gzip bytes (+24). Source snapshots are compressed so test discovery cannot execute archived tests.

## Verification and next work

All workspace typechecks/tests/builds, dead-code analysis and public-export checks passed. Core has 239 passing tests. Eight source/built consumer boundaries passed. Semantic preflight passed 63 policy operations and 36 focused fixture operations. Targeted formatting/lint checks passed. New tests verify every byte split of Unicode and CRLF examples, false/zero/null records, lazy cancellation before a malformed record, producer closure on parse failure, and both record/event byte limits.

Setup-time compilation and small-response overhead remain open targets. This pass does not establish universal performance leadership; the full goal remains active. Changes remain uncommitted and unrelated work is preserved.
