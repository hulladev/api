# Agreed implementation checklist

This tracks the review and the subsequent authoring decisions. Implementation, deterministic checks and the complete measurement pipeline are verified. See `implementation-results.md` for evidence and tradeoffs.

- [x] Guarded concurrent sync/async execution; shared execution vocabulary.
- [x] Response serialization observation and error-hook failure semantics.
- [x] Transport response disposal and stream cancellation/cleanup.
- [x] Portable request signal; explicit body preservation; bounded owned readers.
- [x] In-process FormData and query semantic normalization.
- [x] Repeated response headers and shared Node/Express response lifecycle.
- [x] Executable client scopes, select/compose, no create; server compose.
- [x] Narrower handler status unions with complete route coverage.
- [x] Named middleware plan, precompiled path substitution, frozen shared empties.
- [x] Query/SWR namespaces and cache behavior coverage.
- [x] Cross-transport, concurrency, failure, router and built-export conformance.
- [x] Dedicated documentation lint and updated docs/examples/migration guide.
- [x] Idiomatic-first benchmarks, equal-policy diagnostics and semantic preflight.
- [x] Workload/product provenance, compatible history, process/run samples.
- [x] Route/payload/middleware scaling, socket load and lifecycle metrics.
- [x] IPC, cold-process, TypeScript and browser bundle measurements.
- [x] CI gates and full validation; measured optimization and size results.
