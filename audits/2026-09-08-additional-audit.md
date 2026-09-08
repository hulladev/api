# Additional codebase audit — 2026-09-08

## Resolution — 2026-09-08

All four findings below are fixed in the working tree. Clients reject dot-only path parameters before dispatch; imported open objects retain additional JSON fields; invalid or colliding generated component identifiers raise structured diagnostics; schema imports are selected through generator usage rather than a Zod-specific string check. Component name errors require renaming the affected source components and references.

Six new regression cases cover GET/DELETE request prevention, JSON field preservation and constraints, both component-name failures, and compilation of a custom generator's output. Documentation describes the resulting behavior.

The full `bun run check` passed, including formatting, lint, documentation, dead-code analysis, type checks, workspace tests and framework build tests, production builds, exports, isolated packed-package consumers, runtime probes, and bundle-size checks. HTTP/WebSocket tests needed local socket access after the sandboxed run failed with `listen EPERM`. Core passed 220 tests; OpenAPI passed 15. Existing skipped tests remain skipped. No performance benchmark was run.

The original audit below is retained as historical evidence; its line references and validation statements describe the pre-fix review.

Reviewed the working tree at HEAD `d0795f7`, including the pre-existing fixes documented in the two earlier audits. No production code or existing changes were modified. This was a targeted review of active core routing, request encoding, response ownership, stream framing, WebSocket server lifecycle, query integrations, and OpenAPI import. Archived `legacy/` and exhaustive live host testing were excluded.

Four remaining P2 bugs were reproduced using the current source and installed dependencies. The previous audits' resolved findings are not repeated here.

## 1. Path parameters containing dot segments target a different URL

Location: `packages/core/src/contract/parameters.ts:55–57`.

Path encoding uses `encodeURIComponent`, which leaves `.` and `..` unchanged. Native Request URL normalization then removes these segments. A client route `/items/:id` with base URL `https://example.test/api` and the valid schema input `{ params: { id: '..' } }` sends a request to `https://example.test/api/`. With `id: '.'`, it sends `/api/items/`. A normal identifier correctly sends `/api/items/normal`.

This silently changes the endpoint, potentially invoking another declared route instead of failing validation. The exact consequence depends on the application's route layout; no authorization bypass is claimed.

Suggested fix: reject dot-only parameter segments before sending HTTP requests, or introduce an explicitly supported representation that survives URL normalization. Encoding dots as `%2E` alone is not a reliable solution because URL parsers also normalize encoded dot segments. Cover both GET and a mutating method, and verify that invalid input never reaches the fetcher.

## 2. OpenAPI open objects silently lose their fields

Location: `packages/openapi/src/import.ts:329–334`.

The schema `{ type: 'object', additionalProperties: true }` generates `z.object({})`. Executing that generated validator with `{ keep: 'value' }` returns `{}`. The object generator handles `false` and schema-valued additional properties, but does not preserve properties for `true` or the omitted setting.

Consequently imported free-form object bodies and responses can lose arbitrary fields during validation. This is data transformation, not merely a broader acceptance rule.

Suggested fix: preserve additional JSON properties when allowed, using a suitable catchall or passthrough policy. Retain strict rejection for `false` and validation for schema-valued properties. Add generated-schema round-trip tests with both known and unknown fields.

## 3. Component names can produce invalid TypeScript

Locations: `packages/openapi/src/import.ts:108–113` and `:342–346`.

Generating components named `User-ID` and `User_ID` emits two declarations named `UserIdSchema`. A component named `123` emits `const 123Schema = z.string()`. Generation returns an empty diagnostics list in both cases; the resulting code cannot compile. A Bun TypeScript transpilation probe rejected the generated output with a syntax error.

Suggested fix: allocate valid, unique component identifiers once and reuse that mapping for declarations and references. Alternatively, reject collisions and invalid names with structured diagnostics before returning code. Test collisions, leading digits, and references to renamed components.

## 4. Custom schema generators lose their imports

Location: `packages/openapi/src/import.ts:797–801`.

Schema imports are included only when generated text contains `z.`. A custom generator declaring `import * as v from "valibot"` and returning `v.string()` produces a contract containing the validator call but omits the import. The pluggable generator API therefore emits unusable code for this case.

Suggested fix: let the chosen generator determine required imports, without inspecting for a Zod-specific string. A minimal custom-generator fixture should assert that its declared import survives and the resulting module compiles.

## Validation

- `bun run lint`: passed.
- `bun run typecheck`: passed; 45 Turbo tasks were cache hits, followed by the root scripts check.
- `bun run test`: passed; all 63 Turbo tasks were cache hits.
- Fresh core suite: 25 files, 218 tests passed.
- Fresh OpenAPI suite: 1 file, 11 tests passed.
- `git diff --check`: passed before adding this report.
- Standalone source-level probes reproduced all four findings. No network requests were needed: the path probe captured the native Request in a supplied fetch callback.

The green suites do not exercise these combinations. Full framework builds, package compatibility checks, live cloud deployments, and performance benchmarks were not rerun.

## Maintenance improvements

Prioritize behavioral tests of generated modules over snapshots of generated strings: parse and execute representative schemas, assert retained data, and compile custom-generator output. Centralize component-name allocation to prevent declaration/reference drift. Add a cross-transport path-parameter matrix covering dot segments, encoded slashes, Unicode, and empty strings; assert actual native URLs as well as transport-neutral request paths.
