# Contributing

Use Bun for dependency installation and scripts. Keep the active implementation inside `packages/**`; treat `legacy/**` as read-only behavioral reference.

Before opening a pull request, run:

```bash
bun run check
```

Prefer tests that state contract laws—especially encode/decode round trips and client/server agreement—over tests coupled to internal helpers. New dependencies should point inward: core contract code must stay browser-safe and framework-neutral.

## Core maintainability

- Use `type` aliases for object shapes; use `interface` only for required declaration merging.
- Follow the request lifecycle in [the architecture guide](./docs/architecture.md). Prefer named values, direct control
  flow, and ordinary async functions over numeric field dispatch, unchecked tuples, or resumable execution machinery.
- Prepare paths and schema functions once from the route manifest. Add another cached representation only when it
  has a distinct owner and a demonstrated need. Keep request state outside configuration caches.
- Keep client selection independent of server completeness. Put server-only composition inside `server/`.
- Preserve validation, error phases, abort propagation, repeated headers, and stream cleanup when simplifying code.
  Use behavioral and type tests for these promises; avoid tests that merely assert a cache or helper exists.
- Start performance work from the simplest correct implementation. Retain an optimization only when repeatable
  measurements show a meaningful benefit in realistic workloads and the added branches remain understandable.
  Report absolute costs, bundle impact, and tradeoffs; a microbenchmark ranking alone is not an acceptance criterion.
- Update the public guides and migration notes with API or observable behavior changes. Remove obsolete implementation
  files and tests; label historical reports as historical instead of presenting them as the current architecture.

`audits/` contains historical investigations. Current behavior belongs in `docs/`, current verification in executable
checks, and reproducible measurements in the [benchmark suite](./benchmarks/README.md).
