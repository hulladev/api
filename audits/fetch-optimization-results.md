# Fetch and bundle optimization follow-up

This compares the broad refactor as it stood at the start of this follow-up with the retained optimizations. It does not compare against the original pre-refactor revision. The complete fixtures, raw batches, process medians, discarded reader experiments, and built-JavaScript fingerprints are in [fetch-optimization-results.json](fetch-optimization-results.json).

## Retained changes

- Client and server route compilation are directional. Client bundles no longer retain server path/query decoders or routing patterns. Server adapters no longer retain client path/query encoders. Immutable contract and route caches remain separate per direction; schema execution and response schema plans are still shared. Authoring syntax is unchanged.
- Response serialization without a response-header schema bypasses concurrent-validation coordination. Header normalization is synchronous in this case. The guarded concurrent path remains for schema-backed headers, preserving mixed asynchronous failures and cleanup.
- Fetch header conversion avoids allocating an empty cookie array when the response has no Set-Cookie header. Repeated cookies remain separate.
- Chunked JSON reading is now part of scaling diagnostics, with 256-byte, 16 KiB and 256 KiB payloads; 1 KiB and 64 KiB chunks; and explicitly labeled bounded and native-unbounded policies. Fresh request construction, stream delivery and actual parsed values are part of each measured operation.
- New behavior tests cover split UTF-8 at the exact limit, overflow cancellation, preserved-body tee cleanup, producer failures and zero-byte bodies. They pass against the retained original reader.

Fixed bundle caps have been removed at the user's direction. `check:size` still builds consumer fixtures and records sizes/provenance; build failures remain errors. Size is review evidence during active development, not a fixed component quota.

## Bundle results

These fixtures use actual built entrypoints. The table reports minified / gzip bytes; schema libraries are externalized. The combined executable fixture includes client and server, and should not be mistaken for a browser-only footprint.

| Fixture | Before | After |
|---|---:|---:|
| @hulla/api | 49,887 / 15,426 | 50,149 / 15,503 |
| Transport-neutral client | 25,905 / 8,588 | 24,978 / 8,362 |
| Transport-neutral client + server | 29,934 / 9,684 | 29,007 / 9,458 |
| Fetch server adapter | 24,171 / 7,839 | 22,599 / 7,443 |
| Fetch client transport | 3,548 / 1,596 | 3,553 / 1,591 |

The identical schema-free browser fixture built against the two snapshots measured **29,050 → 28,055 minified bytes**, and **9,591 → 9,336 gzip bytes**. This browser comparison uses gzip level 6; the package-size table uses level 9. Its absolute built-module imports differ from the public package imports in the diagnostic runner, so do not splice its byte counts into that report's historical series.

The combined client/server fixture grows slightly because it retains both directional compilers/caches and the serialization fast path. This is an explicit tradeoff for smaller individual consumers and less request-time work; it is not a claim that every bundle shrinks.

## Complete GET calls

Same validated Unicode path and JSON result before/after, zero or five server middleware layers. Three fresh processes per runtime, 1,000 warmup calls, eleven alternating-order batches of at least 80 ms. Values are medians of process medians. Lower is better.

| Runtime | Transport | Server middleware | Before µs | After µs | Change |
|---|---|---:|---:|---:|---:|
| Bun 1.4.0 | inprocess | 0 | 1.857 | 1.837 | -1.1% |
| Bun 1.4.0 | fetch | 0 | 3.615 | 3.577 | -1.1% |
| Bun 1.4.0 | inprocess | 5 | 2.231 | 2.226 | -0.3% |
| Bun 1.4.0 | fetch | 5 | 4.113 | 3.895 | -5.3% |
| Node 22.18.0 | inprocess | 0 | 2.965 | 2.908 | -1.9% |
| Node 22.18.0 | fetch | 0 | 9.800 | 9.734 | -0.7% |
| Node 22.18.0 | inprocess | 5 | 3.315 | 3.190 | -3.8% |
| Node 22.18.0 | fetch | 5 | 10.374 | 10.109 | -2.6% |

These are modest local improvements, with shared-machine variability. They do not establish production throughput, statistical significance for every cell, or full recovery of the original pre-refactor Fetch regression. Node and Bun results are reported separately.

## Experiments deliberately not retained

The direct bounded reader improved medium/large chunked reads in both runtimes (roughly 8–19% in the sampled diagnostics), but longer small-body runs reproduced a Bun regression. Lazy chunk-array allocation and a specialized first-chunk path did not remove the tiny chunked-body slowdown. All reader variants were discarded; the original reader and its limit/cancellation guarantees remain. The raw evidence includes the unfavorable results. Earlier progress updates describing large-body gains referred to these experiments, not the final implementation.

Shared response-wrapper methods increased size without a repeatable GET improvement. Removing an extra response-writing Promise did not produce a repeatable improvement. A namespace-export/build-layout experiment increased size. None were retained.

Temporary unsafe ablations isolated native signal access at about 0.15–0.2 µs in one Bun GET workload. Removing disposal guarding did not improve that experiment. These ablations were never production changes, and must not be presented as equivalent-policy benchmarks.

## Package boundary decision

The proposed package extraction was superseded after discussion. Fetch stays included at `@hulla/api/fetch`, with no extra installation or new runtime package. Core continues to own declarations, schema execution, middleware, context and portable execution. Native header conversion now has its own internal adapter module; portable header handling stays in core. Existing public helper exports remain compatible.

Consumer boundary checks build seven representative applications against both source and distributed entrypoints. Non-Fetch applications must exclude Fetch/HTTP implementations; browser bundles must exclude Node helpers and external runtime dependencies. Fetch client/server fixtures must exclude the opposite implementation, and positive fixtures ensure selected Fetch/Node modules are retained. Real bundled client/server calls are executed as part of the check. `bun run check:exports` runs these checks in the standard verification pipeline.

This module-boundary follow-up occurs after the timing/size comparison above. It makes no new timing claim. Installing the package still downloads optional Fetch files; those files do not inherently enter a non-Fetch application's bundle. A separate helper package remains an option only where shared dependencies warrant it and the graph stays one-way.

## Verification

`bun run check` passes: formatting, lint, documentation policy, dead-code analysis, workspace types/tests/builds, built entrypoints, consumer declaration emission and bundle measurement. Core has 221 passing runtime tests. The SolidStart production-build test was additionally run with the newer available Node binary: all 7 SolidStart tests passed. A pre-existing IPC cleanup test exposed a timing race under parallel workspace load; it now waits with a timeout for actual producer finalization instead of assuming a zero-delay timer delivers the remote cancellation.

The complete benchmark pipeline passed with run ID `4ec4eac3-d0d8-4186-9919-4eb889a9fa75`: 89 main operations, 34 adapter cohorts, 12 diagnostic processes and 147 diagnostic rows, with zero offered-load failures. All four artifact families were verified against the same identity. Measurements used three processes, five batches, 1,000 iterations, 200 warmup calls, a 10 ms minimum batch, 200 diagnostic requests and 1-second offered-load windows. These short local load windows are verification evidence, not sustained production capacity estimates.

Changes remain uncommitted. Fetch remains an optional entrypoint within core; it needs no package migration. The subsequent MessagePort extraction is described below.


### Boundary follow-up verification

After separating native header helpers, `bun run check` passed. The seven consumer fixtures pass against both source and built entrypoints; the final boundary checker also passed its typecheck and lint checks. Node builtins are permitted in the explicit Node fixture and excluded from browser consumers. These checks enforce dependency boundaries without imposing size caps or moving Fetch to another package.

### MessagePort package extraction

MessagePort and custom ordered IPC endpoints now live in `@hulla/api-message-port`, with a peer dependency on core and no dependency back from core. Fetch and in-process remain core subpaths. The old `@hulla/api/message-port` export is removed; installation and import migration are documented in `docs/migration.md`. Transport signatures, wire protocol and default channel are unchanged.

The full `bun run check` passes after extraction: 212 core tests and 9 MessagePort/conformance tests pass. The standard workspace run skips the SolidStart production-build test on the default older Node version; the newer-Node verification above predates this extraction. Built-package verification exercises a real MessageChannel roundtrip and emits declarations for an inferred IPC client. Source and built consumer checks reject MessagePort retention outside its selected consumer and reject a core runtime dependency on the new package. Size reporting includes separate MessagePort client and server fixtures, without caps. A 200-request-per-cell IPC diagnostic also completed successfully. This extraction makes no new throughput improvement claim.
