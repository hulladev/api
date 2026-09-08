# Response headers and compiled executor experiments — 8 September 2026

Two Hono-inspired hypotheses were implemented and measured separately. The lazy response-header implementation was rejected. The simpler compiled server executor was retained after an independent follow-up against fresh controls. All prior unrelated working-tree changes were preserved; nothing was committed.

## Retained: compiled server execution

At contract compilation, routes with no context factory, middleware or declared errors select a smaller executor. Other routes retain the general executor. The smaller path removes unused context/middleware/error machinery from request execution while preserving input/output validation, async schemas/handlers, abort checks, response conversion and error-observer phases/replacements. Both executors share error recovery. The production change is confined to `packages/core/src/adapters/runtime.ts`.

The executor-only follow-up uses a fresh baseline cohort, so it is not confounded by the rejected header implementation. Values are microseconds per operation; negative differences mean less time.

| Runtime | Scenario | Before µs | Executor µs | Difference |
|---|---|---:|---:|---:|
| bun | static-get | 1.724 | 1.679 | -2.6% |
| bun | small-json-post | 2.803 | 2.806 | +0.1% |
| bun | large-json-post | 45.540 | 46.002 | +1.0% |
| bun | path-parameter-read | 3.133 | 3.024 | -3.5% |
| bun | query-header-read | 7.085 | 6.859 | -3.2% |
| bun | mixed-update | 6.418 | 6.382 | -0.6% |
| node | static-get | 6.049 | 5.887 | -2.7% |
| node | small-json-post | 10.586 | 10.478 | -1.0% |
| node | large-json-post | 73.014 | 71.668 | -1.8% |
| node | path-parameter-read | 8.545 | 8.524 | -0.2% |
| node | query-header-read | 11.971 | 11.786 | -1.5% |
| node | mixed-update | 15.619 | 15.403 | -1.4% |

The useful signal is modest: GET improves about 2.6–2.7% on both runtimes, and Bun path/query reads about 3%. Other cases are mostly close, including Bun large JSON at +1.0%. These small samples do not prove every small difference. Direct controls and Hono remain in the raw data: control-adjusted GET changes are -2.8% Bun/-1.8% Node; Bun path/query are -2.1%/-3.8%. Bun mixed-update controls moved enough that the adjusted -5.5% should not be presented as a demonstrated gain over its raw -0.6% result. These measurements do not establish that Hulla now beats Hono.

## Rejected: lazy client response headers

The candidate added targeted content-type lookup and deferred materializing the full response-header record until a schema or caller needed it. A native Headers snapshot preserved existing behavior when a mutable Response was subsequently changed; repeated Set-Cookie values and enumerable result headers were retained.

With 32 additional response headers left unused, client-only response handling improved 42.6% on Bun. However, the same case regressed 3.5% on Node. Node ordinary strict-parity/application cases regressed 3.3–24.3%; metadata access/schema cases regressed roughly 31–37% in this cohort. Bun full-header access also regressed, especially sparse responses. The native snapshot and deferred-access machinery add work; no profile here isolates their individual contributions.

The three changed header files were restored byte-for-byte to their pre-experiment versions after checking they still matched the measured candidate. No targeted client-header API or altered result-property behavior remains. The combined candidate is also archived, including adverse cells. This rejects this implementation as a default, not every possible future approach to lazy response metadata.

## Method and validation

Thirty timed processes: baseline/header/both candidates with three processes each on Bun and Node, then three fresh baseline/executor pairs per runtime. Each process uses seven shuffled batches per case, at least 40 ms per batch, 1,000 warmups and 2,000 initial iterations before calibration. Launch order alternates; timings do not overlap with each other or test/build work. Public built exports, fixture source and dependencies are frozen. Summaries use median process medians, not per-request latency percentiles. Raw native-policy rows retain their unequal validation-policy caveat.

Additional response workloads have 0/8/32 extra 64-byte headers plus x-id/content-type, with headers unused, read by the caller, or decoded by a schema. They isolate client response processing with a synthetic native response; they do not measure network/server throughput. Handwritten direct controls perform less validation and serve as drift references, not contract competitors.

The retained build passed formatting, lint, documentation checks, dead-code analysis, TypeScript, all 63 workspace test tasks, builds, exports, isolated packed consumers, runtime-host probes and size generation. The workspace test run executed 27 tasks and reused 36 valid cached tasks. Core passed 269 tests, including eight new regression cases covering header snapshots/cookies/enumeration, cancellation, sync/async stage combinations, error replacements and abort after input suspension. Existing tests cover the general executor with contexts, middleware and declared errors.

Combined Fetch bundle size changed from 51,557 to 52,340 minified bytes and 15,974 to 16,170 gzip bytes: +196 gzip bytes. Current full-workspace build and original benchmark fixtures match the executor snapshot fingerprints. No production source changed after its measurement.

[Raw process data, comparisons and artifact hashes](2026-09-08-response-plan-performance.json) accompany runners, check logs and compressed source/build snapshots in ignored `benchmarks/results/response-plans-2026-09-08/`. Source trees containing tests are compressed to avoid accidental test discovery. Absolute values should not be compared against earlier reports with different process cohorts or bundling.
