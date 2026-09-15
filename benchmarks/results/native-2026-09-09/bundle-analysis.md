# Bundle Analysis Report

This report helps identify bundle size issues, dependency bloat, and optimization opportunities.

## Table of Contents

- [Quick Summary](#quick-summary)
- [Largest Modules by Output Contribution](#largest-modules-by-output-contribution)
- [Entry Point Analysis](#entry-point-analysis)
- [Dependency Chains](#dependency-chains)
- [Full Module Graph](#full-module-graph)
- [Raw Data for Searching](#raw-data-for-searching)

---

## Quick Summary

| Metric | Value |
|--------|-------|
| Total output size | 46.1 KB |
| Input modules | 48 |
| Entry points | 1 |
| ESM modules | 48 |
| External imports | 12 |

## Largest Modules by Output Contribution

Modules sorted by bytes contributed to the output bundle. Large modules may indicate bloat.

| Output Bytes | % of Total | Module | Format |
|--------------|------------|--------|--------|
| 3.84 KB | 8.3% | `../packages/core/src/contract/creation.ts` | esm |
| 3.0 KB | 6.6% | `../packages/core/src/fetch/client.ts` | esm |
| 2.71 KB | 5.9% | `../packages/core/src/server/implementation.ts` | esm |
| 2.61 KB | 5.7% | `../packages/core/src/adapters/runtime.ts` | esm |
| 2.33 KB | 5.0% | `../packages/core/src/adapters/web.ts` | esm |
| 2.31 KB | 5.0% | `../packages/core/src/client/response.ts` | esm |
| 2.17 KB | 4.7% | `../packages/core/src/adapters/response.ts` | esm |
| 2.1 KB | 4.5% | `../packages/core/src/client/creation.ts` | esm |
| 1.77 KB | 3.9% | `../packages/core/src/fetch/server.ts` | esm |
| 1.77 KB | 3.8% | `../packages/core/src/client/request.ts` | esm |
| 1.35 KB | 2.9% | `../packages/core/src/validation.ts` | esm |
| 1.30 KB | 2.8% | `../packages/core/src/contract/query.ts` | esm |
| 1.29 KB | 2.8% | `../packages/core/src/adapters/routing.ts` | esm |
| 1.27 KB | 2.8% | `../packages/core/src/contract/paths.ts` | esm |
| 1.26 KB | 2.7% | `../packages/core/src/adapters/input.ts` | esm |
| 1.18 KB | 2.6% | `../packages/core/src/contract/parameters.ts` | esm |
| 1.17 KB | 2.5% | `../packages/core/src/adapters/errors.ts` | esm |
| 1.14 KB | 2.5% | `../packages/core/src/server/definition.ts` | esm |
| 0.85 KB | 1.8% | `../packages/core/src/middleware.ts` | esm |
| 0.84 KB | 1.8% | `../packages/core/src/errors.ts` | esm |

*...and 23 more modules with output contribution*

## Entry Point Analysis

Each entry point and the total code it loads (including shared chunks).

### Entry: `.size-output/hulla-api-source.ts`

**Output file**: `./hulla-api-source.js`
**Bundle size**: 46.1 KB
**Exports**: `client`

**Bundled modules** (sorted by contribution):

| Bytes | Module |
|-------|--------|
| 3.84 KB | `../packages/core/src/contract/creation.ts` |
| 3.0 KB | `../packages/core/src/fetch/client.ts` |
| 2.71 KB | `../packages/core/src/server/implementation.ts` |
| 2.61 KB | `../packages/core/src/adapters/runtime.ts` |
| 2.33 KB | `../packages/core/src/adapters/web.ts` |
| 2.31 KB | `../packages/core/src/client/response.ts` |
| 2.17 KB | `../packages/core/src/adapters/response.ts` |
| 2.1 KB | `../packages/core/src/client/creation.ts` |
| 1.77 KB | `../packages/core/src/fetch/server.ts` |
| 1.77 KB | `../packages/core/src/client/request.ts` |
| 1.35 KB | `../packages/core/src/validation.ts` |
| 1.30 KB | `../packages/core/src/contract/query.ts` |
| 1.29 KB | `../packages/core/src/adapters/routing.ts` |
| 1.27 KB | `../packages/core/src/contract/paths.ts` |
| 1.26 KB | `../packages/core/src/adapters/input.ts` |

*...and 33 more modules*

## Dependency Chains

For each module, shows what files import it. Use this to understand why a module is included.

### Most Commonly Imported Modules

Modules imported by many files. Extracting these to shared chunks may help.

| Import Count | Module | Imported By |
|--------------|--------|-------------|
| 17 | `../packages/core/src/object.ts` | `../packages/core/src/server/definition.ts`, `../packages/core/src/contract/response.ts`, `../packages/core/src/client/definition.ts`+14 more |
| 12 | `../packages/core/src/validation.ts` | `../packages/core/src/contract/response.ts`, `../packages/core/src/contract/route.ts`, `../packages/core/src/server/errors.ts`+9 more |
| 9 | `../packages/core/src/execution.ts` | `../packages/core/src/adapters/runtime.ts`, `../packages/core/src/client/response.ts`, `../packages/core/src/validation.ts`+6 more |
| 8 | `../packages/core/src/server/errors.ts` | `../packages/core/src/server/definition.ts`, `../packages/core/src/adapters/body.ts`, `../packages/core/src/adapters/runtime.ts`+5 more |
| 6 | `../packages/core/src/contract/state.ts` | `../packages/core/src/server/definition.ts`, `../packages/core/src/client/definition.ts`, `../packages/core/src/server/implementation.ts`+3 more |
| 5 | `../packages/core/src/middleware.ts` | `../packages/core/src/server/definition.ts`, `../packages/core/src/client/definition.ts`, `../packages/core/src/adapters/runtime.ts`+2 more |
| 5 | `../packages/core/src/contract/request.ts` | `../packages/core/src/contract/route.ts`, `../packages/core/src/client/response.ts`, `../packages/core/src/adapters/input.ts`+2 more |
| 5 | `../packages/core/src/declared-errors.ts` | `../packages/core/src/adapters/runtime.ts`, `../packages/core/src/client/response.ts`, `../packages/core/src/client/creation.ts`+2 more |
| 5 | `../packages/core/src/errors.ts` | `../packages/core/src/server/errors.ts`, `../packages/core/src/client/response.ts`, `../packages/core/src/validation.ts`+2 more |
| 3 | `../packages/core/src/contract/paths.ts` | `../packages/core/src/contract/route.ts`, `../packages/core/src/contract/router.ts`, `../packages/core/src/contract/creation.ts` |
| 2 | `../packages/core/src/adapters/errors.ts` | `../packages/core/src/adapters/runtime.ts`, `../packages/core/src/adapters/web.ts` |
| 2 | `../packages/core/src/adapters/body.ts` | `../packages/core/src/fetch/server.ts`, `../packages/core/src/adapters/web.ts` |
| 2 | `../packages/core/src/server/composition.ts` | `../packages/core/src/server/definition.ts`, `../packages/core/src/server/implementation.ts` |
| 2 | `../packages/core/src/contract/route.ts` | `../packages/core/src/index.ts`, `../packages/core/src/contract/creation.ts` |
| 2 | `../packages/core/src/contract/parameters.ts` | `../packages/core/src/adapters/input.ts`, `../packages/core/src/client/request.ts` |

## Full Module Graph

Complete dependency information for each module.

### `../packages/core/src/adapters/body.ts`

- **Output contribution**: 0.63 KB
- **Format**: esm
- **Imported by** (2 files): `../packages/core/src/fetch/server.ts` `../packages/core/src/adapters/web.ts`
- **Imports**:
  - `../packages/core/src/server/errors.ts` (import-statement, contributes 476 bytes, specifier: `../server/errors`)

### `../packages/core/src/adapters/errors.ts`

- **Output contribution**: 1.17 KB
- **Format**: esm
- **Imported by** (2 files): `../packages/core/src/adapters/runtime.ts` `../packages/core/src/adapters/web.ts`
- **Imports**:
  - `../packages/core/src/declared-errors.ts` (import-statement, contributes 410 bytes, specifier: `../declared-errors`)
  - `../packages/core/src/errors.ts` (import-statement, contributes 0.84 KB, specifier: `../errors`)
  - `../packages/core/src/server/errors.ts` (import-statement, contributes 476 bytes, specifier: `../server/errors`)
  - `../packages/core/src/validation.ts` (import-statement, contributes 1.35 KB, specifier: `../validation`)

### `../packages/core/src/adapters/headers.ts`

- **Output contribution**: 312 bytes
- **Format**: esm
- **Imported by** (2 files): `../packages/core/src/fetch/client.ts` `../packages/core/src/adapters/web.ts`

### `../packages/core/src/adapters/input.ts`

- **Output contribution**: 1.26 KB
- **Format**: esm
- **Imported by** (1 files): `../packages/core/src/adapters/runtime.ts`
- **Imports**:
  - `../packages/core/src/contract/parameters.ts` (import-statement, contributes 1.18 KB, specifier: `../contract/parameters`)
  - `../packages/core/src/contract/query.ts` (import-statement, contributes 1.30 KB, specifier: `../contract/query`)
  - `../packages/core/src/contract/request.ts` (import-statement, contributes 0.80 KB, specifier: `../contract/request`)
  - `../packages/core/src/execution.ts` (import-statement, contributes 0.55 KB, specifier: `../execution`)
  - `../packages/core/src/server/errors.ts` (import-statement, contributes 476 bytes, specifier: `../server/errors`)
  - `../packages/core/src/validation.ts` (import-statement, contributes 1.35 KB, specifier: `../validation`)

### `../packages/core/src/adapters/response.ts`

- **Output contribution**: 2.17 KB
- **Format**: esm
- **Imported by** (1 files): `../packages/core/src/adapters/runtime.ts`
- **Imports**:
  - `../packages/core/src/contract/schema.ts` (import-statement, contributes 321 bytes, specifier: `../contract/schema`)
  - `../packages/core/src/execution.ts` (import-statement, contributes 0.55 KB, specifier: `../execution`)
  - `../packages/core/src/headers.ts` (import-statement, contributes 0.55 KB, specifier: `../headers`)
  - `../packages/core/src/object.ts` (import-statement, contributes 334 bytes, specifier: `../object`)
  - `../packages/core/src/server/errors.ts` (import-statement, contributes 476 bytes, specifier: `../server/errors`)

### `../packages/core/src/adapters/routing.ts`

- **Output contribution**: 1.29 KB
- **Format**: esm
- **Imported by** (1 files): `../packages/core/src/adapters/runtime.ts`
- **Imports**:
  - `../packages/core/src/object.ts` (import-statement, contributes 334 bytes, specifier: `../object`)
  - `../packages/core/src/server/errors.ts` (import-statement, contributes 476 bytes, specifier: `../server/errors`)

### `../packages/core/src/adapters/runtime.ts`

- **Output contribution**: 2.61 KB
- **Format**: esm
- **Imported by** (1 files): `../packages/core/src/fetch/server.ts`
- **Imports**:
  - `../packages/core/src/declared-errors.ts` (import-statement, contributes 410 bytes, specifier: `../declared-errors`)
  - `../packages/core/src/execution.ts` (import-statement, contributes 0.55 KB, specifier: `../execution`)
  - `../packages/core/src/middleware.ts` (import-statement, contributes 0.85 KB, specifier: `../middleware`)
  - `../packages/core/src/object.ts` (import-statement, contributes 334 bytes, specifier: `../object`)
  - `../packages/core/src/server/errors.ts` (import-statement, contributes 476 bytes, specifier: `../server/errors`)
  - `../packages/core/src/server/response.ts` (import-statement, contributes 84 bytes, specifier: `../server/response`)
  - `../packages/core/src/adapters/errors.ts` (import-statement, contributes 1.17 KB, specifier: `./errors`)
  - `../packages/core/src/adapters/input.ts` (import-statement, contributes 1.26 KB, specifier: `./input`)
  - `../packages/core/src/adapters/response.ts` (import-statement, contributes 2.17 KB, specifier: `./response`)
  - `../packages/core/src/adapters/routing.ts` (import-statement, contributes 1.29 KB, specifier: `./routing`)

### `../packages/core/src/adapters/web.ts`

- **Output contribution**: 2.33 KB
- **Format**: esm
- **Imported by** (1 files): `../packages/core/src/fetch/server.ts`
- **Imports**:
  - `../packages/core/src/adapters/body.ts` (import-statement, contributes 0.63 KB, specifier: `./body`)
  - `../packages/core/src/adapters/errors.ts` (import-statement, contributes 1.17 KB, specifier: `./errors`)
  - `../packages/core/src/adapters/headers.ts` (import-statement, contributes 312 bytes, specifier: `./headers`)

### `../packages/core/src/client/creation.ts`

- **Output contribution**: 2.1 KB
- **Format**: esm
- **Imported by** (1 files): `../packages/core/src/client/definition.ts`
- **Imports**:
  - `../packages/core/src/contract/state.ts` (import-statement, contributes 0.72 KB, specifier: `../contract/state`)
  - `../packages/core/src/declared-errors.ts` (import-statement, contributes 410 bytes, specifier: `../declared-errors`)
  - `../packages/core/src/execution.ts` (import-statement, contributes 0.55 KB, specifier: `../execution`)
  - `../packages/core/src/middleware.ts` (import-statement, contributes 0.85 KB, specifier: `../middleware`)
  - `../packages/core/src/object.ts` (import-statement, contributes 334 bytes, specifier: `../object`)
  - `../packages/core/src/client/integration.ts` (import-statement, contributes 48 bytes, specifier: `./integration`)
  - `../packages/core/src/client/request.ts` (import-statement, contributes 1.77 KB, specifier: `./request`)
  - `../packages/core/src/client/response.ts` (import-statement, contributes 2.31 KB, specifier: `./response`)

### `../packages/core/src/client/definition.ts`

- **Output contribution**: 0.52 KB
- **Format**: esm
- **Imported by** (1 files): `../packages/core/src/client/index.ts`
- **Imports**:
  - `../packages/core/src/contract/state.ts` (import-statement, contributes 0.72 KB, specifier: `../contract/state`)
  - `../packages/core/src/middleware.ts` (import-statement, contributes 0.85 KB, specifier: `../middleware`)
  - `../packages/core/src/object.ts` (import-statement, contributes 334 bytes, specifier: `../object`)
  - `../packages/core/src/client/creation.ts` (import-statement, contributes 2.1 KB, specifier: `./creation`)

### `../packages/core/src/client/index.ts`

- **Format**: esm
- **Imported by** (1 files): `.size-output/hulla-api-source.ts`
- **Imports**:
  - `../packages/core/src/client/definition.ts` (import-statement, contributes 0.52 KB, specifier: `./definition`)
  - `./integration` (import-statement, **external**)
  - `./response` (import-statement, **external**)

### `../packages/core/src/client/integration.ts`

- **Output contribution**: 48 bytes
- **Format**: esm
- **Imported by** (1 files): `../packages/core/src/client/creation.ts`

### `../packages/core/src/client/request.ts`

- **Output contribution**: 1.77 KB
- **Format**: esm
- **Imported by** (1 files): `../packages/core/src/client/creation.ts`
- **Imports**:
  - `../packages/core/src/contract/parameters.ts` (import-statement, contributes 1.18 KB, specifier: `../contract/parameters`)
  - `../packages/core/src/contract/query.ts` (import-statement, contributes 1.30 KB, specifier: `../contract/query`)
  - `../packages/core/src/contract/request.ts` (import-statement, contributes 0.80 KB, specifier: `../contract/request`)
  - `../packages/core/src/execution.ts` (import-statement, contributes 0.55 KB, specifier: `../execution`)
  - `../packages/core/src/object.ts` (import-statement, contributes 334 bytes, specifier: `../object`)
  - `../packages/core/src/validation.ts` (import-statement, contributes 1.35 KB, specifier: `../validation`)

### `../packages/core/src/client/response.ts`

- **Output contribution**: 2.31 KB
- **Format**: esm
- **Imported by** (2 files): `../packages/core/src/fetch/client.ts` `../packages/core/src/client/creation.ts`
- **Imports**:
  - `../packages/core/src/contract/request.ts` (import-statement, contributes 0.80 KB, specifier: `../contract/request`)
  - `../packages/core/src/contract/schema.ts` (import-statement, contributes 321 bytes, specifier: `../contract/schema`)
  - `../packages/core/src/declared-errors.ts` (import-statement, contributes 410 bytes, specifier: `../declared-errors`)
  - `../packages/core/src/errors.ts` (import-statement, contributes 0.84 KB, specifier: `../errors`)
  - `../packages/core/src/execution.ts` (import-statement, contributes 0.55 KB, specifier: `../execution`)
  - `../packages/core/src/headers.ts` (import-statement, contributes 0.55 KB, specifier: `../headers`)
  - `../packages/core/src/object.ts` (import-statement, contributes 334 bytes, specifier: `../object`)
  - `../packages/core/src/validation.ts` (import-statement, contributes 1.35 KB, specifier: `../validation`)

### `../packages/core/src/compiler.ts`

- **Output contribution**: 195 bytes
- **Format**: esm
- **Imported by** (1 files): `../packages/core/src/contract/creation.ts`
- **Imports**:
  - `../packages/core/src/contract/state.ts` (import-statement, contributes 0.72 KB, specifier: `./contract/state`)

### `../packages/core/src/contract/creation.ts`

- **Output contribution**: 3.84 KB
- **Format**: esm
- **Imported by** (1 files): `../packages/core/src/contract/definition.ts`
- **Imports**:
  - `../packages/core/src/compiler.ts` (import-statement, contributes 195 bytes, specifier: `../compiler`)
  - `../packages/core/src/declared-errors.ts` (import-statement, contributes 410 bytes, specifier: `../declared-errors`)
  - `../packages/core/src/object.ts` (import-statement, contributes 334 bytes, specifier: `../object`)
  - `../packages/core/src/contract/paths.ts` (import-statement, contributes 1.27 KB, specifier: `./paths`)
  - `../packages/core/src/contract/route.ts` (import-statement, contributes 0.73 KB, specifier: `./route`)
  - `../packages/core/src/contract/router.ts` (import-statement, contributes 167 bytes, specifier: `./router`)

### `../packages/core/src/contract/definition.ts`

- **Output contribution**: 27 bytes
- **Format**: esm
- **Imported by** (1 files): `../packages/core/src/contract/index.ts`
- **Imports**:
  - `../packages/core/src/contract/creation.ts` (import-statement, contributes 3.84 KB, specifier: `./creation`)
  - `../packages/core/src/contract/input.ts` (import-statement, specifier: `./input`)
  - `../packages/core/src/contract/state.ts` (import-statement, contributes 0.72 KB, specifier: `./state`)

### `../packages/core/src/contract/index.ts`

- **Format**: esm
- **Imported by** (1 files): `../packages/core/src/index.ts`
- **Imports**:
  - `../packages/core/src/contract/definition.ts` (import-statement, contributes 27 bytes, specifier: `./definition`)

### `../packages/core/src/contract/parameters.ts`

- **Output contribution**: 1.18 KB
- **Format**: esm
- **Imported by** (2 files): `../packages/core/src/adapters/input.ts` `../packages/core/src/client/request.ts`
- **Imports**:
  - `../packages/core/src/execution.ts` (import-statement, contributes 0.55 KB, specifier: `../execution`)
  - `../packages/core/src/object.ts` (import-statement, contributes 334 bytes, specifier: `../object`)
  - `../packages/core/src/validation.ts` (import-statement, contributes 1.35 KB, specifier: `../validation`)

### `../packages/core/src/contract/paths.ts`

- **Output contribution**: 1.27 KB
- **Format**: esm
- **Imported by** (3 files): `../packages/core/src/contract/route.ts` `../packages/core/src/contract/router.ts` `../packages/core/src/contract/creation.ts`

### `../packages/core/src/contract/query.ts`

- **Output contribution**: 1.30 KB
- **Format**: esm
- **Imported by** (2 files): `../packages/core/src/adapters/input.ts` `../packages/core/src/client/request.ts`
- **Imports**:
  - `../packages/core/src/errors.ts` (import-statement, contributes 0.84 KB, specifier: `../errors`)
  - `../packages/core/src/execution.ts` (import-statement, contributes 0.55 KB, specifier: `../execution`)
  - `../packages/core/src/object.ts` (import-statement, contributes 334 bytes, specifier: `../object`)
  - `../packages/core/src/validation.ts` (import-statement, contributes 1.35 KB, specifier: `../validation`)

### `../packages/core/src/contract/representation.ts`

- **Output contribution**: 0.61 KB
- **Format**: esm
- **Imported by** (2 files): `../packages/core/src/contract/response.ts` `../packages/core/src/contract/request.ts`

### `../packages/core/src/contract/request.ts`

- **Output contribution**: 0.80 KB
- **Format**: esm
- **Imported by** (5 files): `../packages/core/src/contract/route.ts` `../packages/core/src/client/response.ts` `../packages/core/src/adapters/input.ts` `../packages/core/src/contract/schema.ts` `../packages/core/src/client/request.ts`
- **Imports**:
  - `../packages/core/src/validation.ts` (import-statement, contributes 1.35 KB, specifier: `../validation`)
  - `../packages/core/src/contract/representation.ts` (import-statement, contributes 0.61 KB, specifier: `./representation`)

### `../packages/core/src/contract/response.ts`

- **Output contribution**: 0.69 KB
- **Format**: esm
- **Imported by** (1 files): `../packages/core/src/index.ts`
- **Imports**:
  - `../packages/core/src/object.ts` (import-statement, contributes 334 bytes, specifier: `../object`)
  - `../packages/core/src/stream.ts` (import-statement, contributes 400 bytes, specifier: `../stream`)
  - `../packages/core/src/validation.ts` (import-statement, contributes 1.35 KB, specifier: `../validation`)
  - `../packages/core/src/contract/representation.ts` (import-statement, contributes 0.61 KB, specifier: `./representation`)

### `../packages/core/src/contract/route.ts`

- **Output contribution**: 0.73 KB
- **Format**: esm
- **Imported by** (2 files): `../packages/core/src/index.ts` `../packages/core/src/contract/creation.ts`
- **Imports**:
  - `../packages/core/src/validation.ts` (import-statement, contributes 1.35 KB, specifier: `../validation`)
  - `../packages/core/src/contract/paths.ts` (import-statement, contributes 1.27 KB, specifier: `./paths`)
  - `../packages/core/src/contract/request.ts` (import-statement, contributes 0.80 KB, specifier: `./request`)

### `../packages/core/src/contract/router.ts`

- **Output contribution**: 167 bytes
- **Format**: esm
- **Imported by** (2 files): `../packages/core/src/server/implementation.ts` `../packages/core/src/contract/creation.ts`
- **Imports**:
  - `../packages/core/src/object.ts` (import-statement, contributes 334 bytes, specifier: `../object`)
  - `../packages/core/src/contract/paths.ts` (import-statement, contributes 1.27 KB, specifier: `./paths`)

### `../packages/core/src/contract/schema.ts`

- **Output contribution**: 321 bytes
- **Format**: esm
- **Imported by** (2 files): `../packages/core/src/client/response.ts` `../packages/core/src/adapters/response.ts`
- **Imports**:
  - `../packages/core/src/validation.ts` (import-statement, contributes 1.35 KB, specifier: `../validation`)
  - `../packages/core/src/contract/request.ts` (import-statement, contributes 0.80 KB, specifier: `./request`)

### `../packages/core/src/contract/state.ts`

- **Output contribution**: 0.72 KB
- **Format**: esm
- **Imported by** (6 files): `../packages/core/src/server/definition.ts` `../packages/core/src/client/definition.ts` `../packages/core/src/server/implementation.ts` `../packages/core/src/contract/definition.ts` `../packages/core/src/client/creation.ts` +1 more
- **Imports**:
  - `../packages/core/src/object.ts` (import-statement, contributes 334 bytes, specifier: `../object`)

### `../packages/core/src/declared-errors.ts`

- **Output contribution**: 410 bytes
- **Format**: esm
- **Imported by** (5 files): `../packages/core/src/adapters/runtime.ts` `../packages/core/src/client/response.ts` `../packages/core/src/client/creation.ts` `../packages/core/src/adapters/errors.ts` `../packages/core/src/contract/creation.ts`
- **Imports**:
  - `../packages/core/src/object.ts` (import-statement, contributes 334 bytes, specifier: `./object`)
  - `../packages/core/src/validation.ts` (import-statement, contributes 1.35 KB, specifier: `./validation`)

### `../packages/core/src/errors.ts`

- **Output contribution**: 0.84 KB
- **Format**: esm
- **Imported by** (5 files): `../packages/core/src/server/errors.ts` `../packages/core/src/client/response.ts` `../packages/core/src/validation.ts` `../packages/core/src/adapters/errors.ts` `../packages/core/src/contract/query.ts`

### `../packages/core/src/execution.ts`

- **Output contribution**: 0.55 KB
- **Format**: esm
- **Imported by** (9 files): `../packages/core/src/adapters/runtime.ts` `../packages/core/src/client/response.ts` `../packages/core/src/validation.ts` `../packages/core/src/client/creation.ts` `../packages/core/src/adapters/response.ts` +4 more

### `../packages/core/src/fetch/client.ts`

- **Output contribution**: 3.0 KB
- **Format**: esm
- **Imported by** (1 files): `../packages/core/src/fetch/index.ts`
- **Imports**:
  - `../packages/core/src/adapters/headers.ts` (import-statement, contributes 312 bytes, specifier: `../adapters/headers`)
  - `../packages/core/src/client/response.ts` (import-statement, contributes 2.31 KB, specifier: `../client/response`)

### `../packages/core/src/fetch/index.ts`

- **Format**: esm
- **Imported by** (1 files): `.size-output/hulla-api-source.ts`
- **Imports**:
  - `../packages/core/src/fetch/client.ts` (import-statement, contributes 3.0 KB, specifier: `./client`)
  - `../packages/core/src/fetch/server.ts` (import-statement, contributes 1.77 KB, specifier: `./server`)

### `../packages/core/src/fetch/server.ts`

- **Output contribution**: 1.77 KB
- **Format**: esm
- **Imported by** (1 files): `../packages/core/src/fetch/index.ts`
- **Imports**:
  - `../packages/core/src/adapters/body.ts` (import-statement, contributes 0.63 KB, specifier: `../adapters/body`)
  - `../packages/core/src/adapters/runtime.ts` (import-statement, contributes 2.61 KB, specifier: `../adapters/runtime`)
  - `../packages/core/src/adapters/web.ts` (import-statement, contributes 2.33 KB, specifier: `../adapters/web`)
  - `../packages/core/src/server/context.ts` (import-statement, contributes 0.75 KB, specifier: `../server/context`)

### `../packages/core/src/headers.ts`

- **Output contribution**: 0.55 KB
- **Format**: esm
- **Imported by** (2 files): `../packages/core/src/client/response.ts` `../packages/core/src/adapters/response.ts`
- **Imports**:
  - `../packages/core/src/object.ts` (import-statement, contributes 334 bytes, specifier: `./object`)

### `../packages/core/src/index.ts`

- **Format**: esm
- **Imported by** (1 files): `.size-output/hulla-api-source.ts`
- **Imports**:
  - `./compiler` (import-statement, **external**)
  - `../packages/core/src/contract/index.ts` (import-statement, specifier: `./contract`)
  - `./declared-errors` (import-statement, **external**)
  - `./errors` (import-statement, **external**)
  - `./contract/query` (import-statement, **external**)
  - `./validation` (import-statement, **external**)
  - `./contract/request` (import-statement, **external**)
  - `../packages/core/src/contract/response.ts` (import-statement, contributes 0.69 KB, specifier: `./contract/response`)
  - `../packages/core/src/contract/route.ts` (import-statement, contributes 0.73 KB, specifier: `./contract/route`)
  - `./contract/router` (import-statement, **external**)

### `../packages/core/src/middleware.ts`

- **Output contribution**: 0.85 KB
- **Format**: esm
- **Imported by** (5 files): `../packages/core/src/server/definition.ts` `../packages/core/src/client/definition.ts` `../packages/core/src/adapters/runtime.ts` `../packages/core/src/server/implementation.ts` `../packages/core/src/client/creation.ts`

### `../packages/core/src/object.ts`

- **Output contribution**: 334 bytes
- **Format**: esm
- **Imported by** (17 files): `../packages/core/src/server/definition.ts` `../packages/core/src/contract/response.ts` `../packages/core/src/client/definition.ts` `../packages/core/src/adapters/runtime.ts` `../packages/core/src/server/implementation.ts` +12 more

### `../packages/core/src/server/composition.ts`

- **Output contribution**: 182 bytes
- **Format**: esm
- **Imported by** (2 files): `../packages/core/src/server/definition.ts` `../packages/core/src/server/implementation.ts`

### `../packages/core/src/server/context.ts`

- **Output contribution**: 0.75 KB
- **Format**: esm
- **Imported by** (1 files): `../packages/core/src/fetch/server.ts`

### `../packages/core/src/server/definition.ts`

- **Output contribution**: 1.14 KB
- **Format**: esm
- **Imported by** (1 files): `../packages/core/src/server/index.ts`
- **Imports**:
  - `../packages/core/src/contract/state.ts` (import-statement, contributes 0.72 KB, specifier: `../contract/state`)
  - `../packages/core/src/middleware.ts` (import-statement, contributes 0.85 KB, specifier: `../middleware`)
  - `../packages/core/src/object.ts` (import-statement, contributes 334 bytes, specifier: `../object`)
  - `../packages/core/src/server/composition.ts` (import-statement, contributes 182 bytes, specifier: `./composition`)
  - `../packages/core/src/server/errors.ts` (import-statement, contributes 476 bytes, specifier: `./errors`)
  - `../packages/core/src/server/implementation.ts` (import-statement, contributes 2.71 KB, specifier: `./implementation`)

### `../packages/core/src/server/errors.ts`

- **Output contribution**: 476 bytes
- **Format**: esm
- **Imported by** (8 files): `../packages/core/src/server/definition.ts` `../packages/core/src/adapters/body.ts` `../packages/core/src/adapters/runtime.ts` `../packages/core/src/server/implementation.ts` `../packages/core/src/adapters/errors.ts` +3 more
- **Imports**:
  - `../packages/core/src/errors.ts` (import-statement, contributes 0.84 KB, specifier: `../errors`)
  - `../packages/core/src/validation.ts` (import-statement, contributes 1.35 KB, specifier: `../validation`)

### `../packages/core/src/server/implementation.ts`

- **Output contribution**: 2.71 KB
- **Format**: esm
- **Imported by** (1 files): `../packages/core/src/server/definition.ts`
- **Imports**:
  - `../packages/core/src/contract/router.ts` (import-statement, contributes 167 bytes, specifier: `../contract/router`)
  - `../packages/core/src/contract/state.ts` (import-statement, contributes 0.72 KB, specifier: `../contract/state`)
  - `../packages/core/src/middleware.ts` (import-statement, contributes 0.85 KB, specifier: `../middleware`)
  - `../packages/core/src/object.ts` (import-statement, contributes 334 bytes, specifier: `../object`)
  - `../packages/core/src/server/composition.ts` (import-statement, contributes 182 bytes, specifier: `./composition`)
  - `../packages/core/src/server/errors.ts` (import-statement, contributes 476 bytes, specifier: `./errors`)

### `../packages/core/src/server/index.ts`

- **Format**: esm
- **Imported by** (1 files): `.size-output/hulla-api-source.ts`
- **Imports**:
  - `./context` (import-statement, **external**)
  - `./errors` (import-statement, **external**)
  - `../packages/core/src/server/definition.ts` (import-statement, contributes 1.14 KB, specifier: `./definition`)

### `../packages/core/src/server/response.ts`

- **Output contribution**: 84 bytes
- **Format**: esm
- **Imported by** (1 files): `../packages/core/src/adapters/runtime.ts`

### `../packages/core/src/stream.ts`

- **Output contribution**: 400 bytes
- **Format**: esm
- **Imported by** (1 files): `../packages/core/src/contract/response.ts`

### `../packages/core/src/validation.ts`

- **Output contribution**: 1.35 KB
- **Format**: esm
- **Imported by** (12 files): `../packages/core/src/contract/response.ts` `../packages/core/src/contract/route.ts` `../packages/core/src/server/errors.ts` `../packages/core/src/client/response.ts` `../packages/core/src/contract/request.ts` +7 more
- **Imports**:
  - `../packages/core/src/errors.ts` (import-statement, contributes 0.84 KB, specifier: `./errors`)
  - `../packages/core/src/execution.ts` (import-statement, contributes 0.55 KB, specifier: `./execution`)

### `.size-output/hulla-api-source.ts`

- **Output contribution**: 279 bytes
- **Format**: esm
- **Imported by**: (entry point or orphan)
- **Imports**:
  - `../packages/core/src/index.ts` (import-statement, specifier: `../../packages/core/src/index`)
  - `../packages/core/src/client/index.ts` (import-statement, specifier: `../../packages/core/src/client/index`)
  - `../packages/core/src/fetch/index.ts` (import-statement, specifier: `../../packages/core/src/fetch/index`)
  - `../packages/core/src/server/index.ts` (import-statement, specifier: `../../packages/core/src/server/index`)
  - `zod` (import-statement, **external**)

## Raw Data for Searching

This section contains raw, grep-friendly data. Use these patterns:
- `[MODULE:` - Find all modules
- `[OUTPUT_BYTES:` - Find output contribution for each module
- `[IMPORT:` - Find all import relationships
- `[IMPORTED_BY:` - Find reverse dependencies
- `[ENTRY:` - Find entry points
- `[EXTERNAL:` - Find external imports
- `[NODE_MODULES:` - Find node_modules files

### All Modules

```
[MODULE: ../packages/core/src/contract/creation.ts]
[OUTPUT_BYTES: ../packages/core/src/contract/creation.ts = 3844 bytes]
[FORMAT: ../packages/core/src/contract/creation.ts = esm]
[MODULE: ../packages/core/src/fetch/client.ts]
[OUTPUT_BYTES: ../packages/core/src/fetch/client.ts = 3020 bytes]
[FORMAT: ../packages/core/src/fetch/client.ts = esm]
[MODULE: ../packages/core/src/server/implementation.ts]
[OUTPUT_BYTES: ../packages/core/src/server/implementation.ts = 2705 bytes]
[FORMAT: ../packages/core/src/server/implementation.ts = esm]
[MODULE: ../packages/core/src/adapters/runtime.ts]
[OUTPUT_BYTES: ../packages/core/src/adapters/runtime.ts = 2613 bytes]
[FORMAT: ../packages/core/src/adapters/runtime.ts = esm]
[MODULE: ../packages/core/src/adapters/web.ts]
[OUTPUT_BYTES: ../packages/core/src/adapters/web.ts = 2325 bytes]
[FORMAT: ../packages/core/src/adapters/web.ts = esm]
[MODULE: ../packages/core/src/client/response.ts]
[OUTPUT_BYTES: ../packages/core/src/client/response.ts = 2309 bytes]
[FORMAT: ../packages/core/src/client/response.ts = esm]
[MODULE: ../packages/core/src/adapters/response.ts]
[OUTPUT_BYTES: ../packages/core/src/adapters/response.ts = 2171 bytes]
[FORMAT: ../packages/core/src/adapters/response.ts = esm]
[MODULE: ../packages/core/src/client/creation.ts]
[OUTPUT_BYTES: ../packages/core/src/client/creation.ts = 2070 bytes]
[FORMAT: ../packages/core/src/client/creation.ts = esm]
[MODULE: ../packages/core/src/fetch/server.ts]
[OUTPUT_BYTES: ../packages/core/src/fetch/server.ts = 1774 bytes]
[FORMAT: ../packages/core/src/fetch/server.ts = esm]
[MODULE: ../packages/core/src/client/request.ts]
[OUTPUT_BYTES: ../packages/core/src/client/request.ts = 1769 bytes]
[FORMAT: ../packages/core/src/client/request.ts = esm]
[MODULE: ../packages/core/src/validation.ts]
[OUTPUT_BYTES: ../packages/core/src/validation.ts = 1347 bytes]
[FORMAT: ../packages/core/src/validation.ts = esm]
[MODULE: ../packages/core/src/contract/query.ts]
[OUTPUT_BYTES: ../packages/core/src/contract/query.ts = 1302 bytes]
[FORMAT: ../packages/core/src/contract/query.ts = esm]
[MODULE: ../packages/core/src/adapters/routing.ts]
[OUTPUT_BYTES: ../packages/core/src/adapters/routing.ts = 1295 bytes]
[FORMAT: ../packages/core/src/adapters/routing.ts = esm]
[MODULE: ../packages/core/src/contract/paths.ts]
[OUTPUT_BYTES: ../packages/core/src/contract/paths.ts = 1269 bytes]
[FORMAT: ../packages/core/src/contract/paths.ts = esm]
[MODULE: ../packages/core/src/adapters/input.ts]
[OUTPUT_BYTES: ../packages/core/src/adapters/input.ts = 1260 bytes]
[FORMAT: ../packages/core/src/adapters/input.ts = esm]
[MODULE: ../packages/core/src/contract/parameters.ts]
[OUTPUT_BYTES: ../packages/core/src/contract/parameters.ts = 1181 bytes]
[FORMAT: ../packages/core/src/contract/parameters.ts = esm]
[MODULE: ../packages/core/src/adapters/errors.ts]
[OUTPUT_BYTES: ../packages/core/src/adapters/errors.ts = 1167 bytes]
[FORMAT: ../packages/core/src/adapters/errors.ts = esm]
[MODULE: ../packages/core/src/server/definition.ts]
[OUTPUT_BYTES: ../packages/core/src/server/definition.ts = 1135 bytes]
[FORMAT: ../packages/core/src/server/definition.ts = esm]
[MODULE: ../packages/core/src/middleware.ts]
[OUTPUT_BYTES: ../packages/core/src/middleware.ts = 850 bytes]
[FORMAT: ../packages/core/src/middleware.ts = esm]
[MODULE: ../packages/core/src/errors.ts]
[OUTPUT_BYTES: ../packages/core/src/errors.ts = 844 bytes]
[FORMAT: ../packages/core/src/errors.ts = esm]
[MODULE: ../packages/core/src/contract/request.ts]
[OUTPUT_BYTES: ../packages/core/src/contract/request.ts = 802 bytes]
[FORMAT: ../packages/core/src/contract/request.ts = esm]
[MODULE: ../packages/core/src/server/context.ts]
[OUTPUT_BYTES: ../packages/core/src/server/context.ts = 750 bytes]
[FORMAT: ../packages/core/src/server/context.ts = esm]
[MODULE: ../packages/core/src/contract/route.ts]
[OUTPUT_BYTES: ../packages/core/src/contract/route.ts = 733 bytes]
[FORMAT: ../packages/core/src/contract/route.ts = esm]
[MODULE: ../packages/core/src/contract/state.ts]
[OUTPUT_BYTES: ../packages/core/src/contract/state.ts = 725 bytes]
[FORMAT: ../packages/core/src/contract/state.ts = esm]
[MODULE: ../packages/core/src/contract/response.ts]
[OUTPUT_BYTES: ../packages/core/src/contract/response.ts = 695 bytes]
[FORMAT: ../packages/core/src/contract/response.ts = esm]
[MODULE: ../packages/core/src/adapters/body.ts]
[OUTPUT_BYTES: ../packages/core/src/adapters/body.ts = 631 bytes]
[FORMAT: ../packages/core/src/adapters/body.ts = esm]
[MODULE: ../packages/core/src/contract/representation.ts]
[OUTPUT_BYTES: ../packages/core/src/contract/representation.ts = 612 bytes]
[FORMAT: ../packages/core/src/contract/representation.ts = esm]
[MODULE: ../packages/core/src/execution.ts]
[OUTPUT_BYTES: ../packages/core/src/execution.ts = 550 bytes]
[FORMAT: ../packages/core/src/execution.ts = esm]
[MODULE: ../packages/core/src/headers.ts]
[OUTPUT_BYTES: ../packages/core/src/headers.ts = 547 bytes]
[FORMAT: ../packages/core/src/headers.ts = esm]
[MODULE: ../packages/core/src/client/definition.ts]
[OUTPUT_BYTES: ../packages/core/src/client/definition.ts = 517 bytes]
[FORMAT: ../packages/core/src/client/definition.ts = esm]
[MODULE: ../packages/core/src/server/errors.ts]
[OUTPUT_BYTES: ../packages/core/src/server/errors.ts = 476 bytes]
[FORMAT: ../packages/core/src/server/errors.ts = esm]
[MODULE: ../packages/core/src/declared-errors.ts]
[OUTPUT_BYTES: ../packages/core/src/declared-errors.ts = 410 bytes]
[FORMAT: ../packages/core/src/declared-errors.ts = esm]
[MODULE: ../packages/core/src/stream.ts]
[OUTPUT_BYTES: ../packages/core/src/stream.ts = 400 bytes]
[FORMAT: ../packages/core/src/stream.ts = esm]
[MODULE: ../packages/core/src/object.ts]
[OUTPUT_BYTES: ../packages/core/src/object.ts = 334 bytes]
[FORMAT: ../packages/core/src/object.ts = esm]
[MODULE: ../packages/core/src/contract/schema.ts]
[OUTPUT_BYTES: ../packages/core/src/contract/schema.ts = 321 bytes]
[FORMAT: ../packages/core/src/contract/schema.ts = esm]
[MODULE: ../packages/core/src/adapters/headers.ts]
[OUTPUT_BYTES: ../packages/core/src/adapters/headers.ts = 312 bytes]
[FORMAT: ../packages/core/src/adapters/headers.ts = esm]
[MODULE: .size-output/hulla-api-source.ts]
[OUTPUT_BYTES: .size-output/hulla-api-source.ts = 279 bytes]
[FORMAT: .size-output/hulla-api-source.ts = esm]
[MODULE: ../packages/core/src/compiler.ts]
[OUTPUT_BYTES: ../packages/core/src/compiler.ts = 195 bytes]
[FORMAT: ../packages/core/src/compiler.ts = esm]
[MODULE: ../packages/core/src/server/composition.ts]
[OUTPUT_BYTES: ../packages/core/src/server/composition.ts = 182 bytes]
[FORMAT: ../packages/core/src/server/composition.ts = esm]
[MODULE: ../packages/core/src/contract/router.ts]
[OUTPUT_BYTES: ../packages/core/src/contract/router.ts = 167 bytes]
[FORMAT: ../packages/core/src/contract/router.ts = esm]
[MODULE: ../packages/core/src/server/response.ts]
[OUTPUT_BYTES: ../packages/core/src/server/response.ts = 84 bytes]
[FORMAT: ../packages/core/src/server/response.ts = esm]
[MODULE: ../packages/core/src/client/integration.ts]
[OUTPUT_BYTES: ../packages/core/src/client/integration.ts = 48 bytes]
[FORMAT: ../packages/core/src/client/integration.ts = esm]
[MODULE: ../packages/core/src/contract/definition.ts]
[OUTPUT_BYTES: ../packages/core/src/contract/definition.ts = 27 bytes]
[FORMAT: ../packages/core/src/contract/definition.ts = esm]
[MODULE: ../packages/core/src/fetch/index.ts]
[FORMAT: ../packages/core/src/fetch/index.ts = esm]
[MODULE: ../packages/core/src/index.ts]
[FORMAT: ../packages/core/src/index.ts = esm]
[MODULE: ../packages/core/src/client/index.ts]
[FORMAT: ../packages/core/src/client/index.ts = esm]
[MODULE: ../packages/core/src/server/index.ts]
[FORMAT: ../packages/core/src/server/index.ts = esm]
[MODULE: ../packages/core/src/contract/index.ts]
[FORMAT: ../packages/core/src/contract/index.ts = esm]
```

### All Imports

```
[IMPORT: .size-output/hulla-api-source.ts -> ../packages/core/src/index.ts]
[IMPORT: .size-output/hulla-api-source.ts -> ../packages/core/src/client/index.ts]
[IMPORT: .size-output/hulla-api-source.ts -> ../packages/core/src/fetch/index.ts]
[IMPORT: .size-output/hulla-api-source.ts -> ../packages/core/src/server/index.ts]
[EXTERNAL: .size-output/hulla-api-source.ts imports zod]
[IMPORT: ../packages/core/src/fetch/index.ts -> ../packages/core/src/fetch/client.ts]
[IMPORT: ../packages/core/src/fetch/index.ts -> ../packages/core/src/fetch/server.ts]
[EXTERNAL: ../packages/core/src/index.ts imports ./compiler]
[IMPORT: ../packages/core/src/index.ts -> ../packages/core/src/contract/index.ts]
[EXTERNAL: ../packages/core/src/index.ts imports ./declared-errors]
[EXTERNAL: ../packages/core/src/index.ts imports ./errors]
[EXTERNAL: ../packages/core/src/index.ts imports ./contract/query]
[EXTERNAL: ../packages/core/src/index.ts imports ./validation]
[EXTERNAL: ../packages/core/src/index.ts imports ./contract/request]
[IMPORT: ../packages/core/src/index.ts -> ../packages/core/src/contract/response.ts]
[IMPORT: ../packages/core/src/index.ts -> ../packages/core/src/contract/route.ts]
[EXTERNAL: ../packages/core/src/index.ts imports ./contract/router]
[IMPORT: ../packages/core/src/client/index.ts -> ../packages/core/src/client/definition.ts]
[EXTERNAL: ../packages/core/src/client/index.ts imports ./integration]
[EXTERNAL: ../packages/core/src/client/index.ts imports ./response]
[EXTERNAL: ../packages/core/src/server/index.ts imports ./context]
[EXTERNAL: ../packages/core/src/server/index.ts imports ./errors]
[IMPORT: ../packages/core/src/server/index.ts -> ../packages/core/src/server/definition.ts]
[IMPORT: ../packages/core/src/fetch/server.ts -> ../packages/core/src/adapters/body.ts]
[IMPORT: ../packages/core/src/fetch/server.ts -> ../packages/core/src/adapters/runtime.ts]
[IMPORT: ../packages/core/src/fetch/server.ts -> ../packages/core/src/adapters/web.ts]
[IMPORT: ../packages/core/src/fetch/server.ts -> ../packages/core/src/server/context.ts]
[IMPORT: ../packages/core/src/fetch/client.ts -> ../packages/core/src/adapters/headers.ts]
[IMPORT: ../packages/core/src/fetch/client.ts -> ../packages/core/src/client/response.ts]
[IMPORT: ../packages/core/src/server/definition.ts -> ../packages/core/src/contract/state.ts]
[IMPORT: ../packages/core/src/server/definition.ts -> ../packages/core/src/middleware.ts]
[IMPORT: ../packages/core/src/server/definition.ts -> ../packages/core/src/object.ts]
[IMPORT: ../packages/core/src/server/definition.ts -> ../packages/core/src/server/composition.ts]
[IMPORT: ../packages/core/src/server/definition.ts -> ../packages/core/src/server/errors.ts]
[IMPORT: ../packages/core/src/server/definition.ts -> ../packages/core/src/server/implementation.ts]
[IMPORT: ../packages/core/src/contract/index.ts -> ../packages/core/src/contract/definition.ts]
[IMPORT: ../packages/core/src/contract/response.ts -> ../packages/core/src/object.ts]
[IMPORT: ../packages/core/src/contract/response.ts -> ../packages/core/src/stream.ts]
[IMPORT: ../packages/core/src/contract/response.ts -> ../packages/core/src/validation.ts]
[IMPORT: ../packages/core/src/contract/response.ts -> ../packages/core/src/contract/representation.ts]
[IMPORT: ../packages/core/src/contract/route.ts -> ../packages/core/src/validation.ts]
[IMPORT: ../packages/core/src/contract/route.ts -> ../packages/core/src/contract/paths.ts]
[IMPORT: ../packages/core/src/contract/route.ts -> ../packages/core/src/contract/request.ts]
[IMPORT: ../packages/core/src/client/definition.ts -> ../packages/core/src/contract/state.ts]
[IMPORT: ../packages/core/src/client/definition.ts -> ../packages/core/src/middleware.ts]
[IMPORT: ../packages/core/src/client/definition.ts -> ../packages/core/src/object.ts]
[IMPORT: ../packages/core/src/client/definition.ts -> ../packages/core/src/client/creation.ts]
[IMPORT: ../packages/core/src/adapters/body.ts -> ../packages/core/src/server/errors.ts]
[IMPORT: ../packages/core/src/adapters/runtime.ts -> ../packages/core/src/declared-errors.ts]
[IMPORT: ../packages/core/src/adapters/runtime.ts -> ../packages/core/src/execution.ts]
[IMPORT: ../packages/core/src/adapters/runtime.ts -> ../packages/core/src/middleware.ts]
[IMPORT: ../packages/core/src/adapters/runtime.ts -> ../packages/core/src/object.ts]
[IMPORT: ../packages/core/src/adapters/runtime.ts -> ../packages/core/src/server/errors.ts]
[IMPORT: ../packages/core/src/adapters/runtime.ts -> ../packages/core/src/server/response.ts]
[IMPORT: ../packages/core/src/adapters/runtime.ts -> ../packages/core/src/adapters/errors.ts]
[IMPORT: ../packages/core/src/adapters/runtime.ts -> ../packages/core/src/adapters/input.ts]
[IMPORT: ../packages/core/src/adapters/runtime.ts -> ../packages/core/src/adapters/response.ts]
[IMPORT: ../packages/core/src/adapters/runtime.ts -> ../packages/core/src/adapters/routing.ts]
[IMPORT: ../packages/core/src/adapters/web.ts -> ../packages/core/src/adapters/body.ts]
[IMPORT: ../packages/core/src/adapters/web.ts -> ../packages/core/src/adapters/errors.ts]
[IMPORT: ../packages/core/src/adapters/web.ts -> ../packages/core/src/adapters/headers.ts]
[IMPORT: ../packages/core/src/server/errors.ts -> ../packages/core/src/errors.ts]
[IMPORT: ../packages/core/src/server/errors.ts -> ../packages/core/src/validation.ts]
[IMPORT: ../packages/core/src/server/implementation.ts -> ../packages/core/src/contract/router.ts]
[IMPORT: ../packages/core/src/server/implementation.ts -> ../packages/core/src/contract/state.ts]
[IMPORT: ../packages/core/src/server/implementation.ts -> ../packages/core/src/middleware.ts]
[IMPORT: ../packages/core/src/server/implementation.ts -> ../packages/core/src/object.ts]
[IMPORT: ../packages/core/src/server/implementation.ts -> ../packages/core/src/server/composition.ts]
[IMPORT: ../packages/core/src/server/implementation.ts -> ../packages/core/src/server/errors.ts]
[IMPORT: ../packages/core/src/contract/state.ts -> ../packages/core/src/object.ts]
[IMPORT: ../packages/core/src/client/response.ts -> ../packages/core/src/contract/request.ts]
[IMPORT: ../packages/core/src/client/response.ts -> ../packages/core/src/contract/schema.ts]
[IMPORT: ../packages/core/src/client/response.ts -> ../packages/core/src/declared-errors.ts]
[IMPORT: ../packages/core/src/client/response.ts -> ../packages/core/src/errors.ts]
[IMPORT: ../packages/core/src/client/response.ts -> ../packages/core/src/execution.ts]
[IMPORT: ../packages/core/src/client/response.ts -> ../packages/core/src/headers.ts]
[IMPORT: ../packages/core/src/client/response.ts -> ../packages/core/src/object.ts]
[IMPORT: ../packages/core/src/client/response.ts -> ../packages/core/src/validation.ts]
[IMPORT: ../packages/core/src/contract/definition.ts -> ../packages/core/src/contract/creation.ts]
[IMPORT: ../packages/core/src/contract/definition.ts -> ../packages/core/src/contract/input.ts]
[IMPORT: ../packages/core/src/contract/definition.ts -> ../packages/core/src/contract/state.ts]
[IMPORT: ../packages/core/src/validation.ts -> ../packages/core/src/errors.ts]
[IMPORT: ../packages/core/src/validation.ts -> ../packages/core/src/execution.ts]
[IMPORT: ../packages/core/src/contract/request.ts -> ../packages/core/src/validation.ts]
[IMPORT: ../packages/core/src/contract/request.ts -> ../packages/core/src/contract/representation.ts]
[IMPORT: ../packages/core/src/client/creation.ts -> ../packages/core/src/contract/state.ts]
[IMPORT: ../packages/core/src/client/creation.ts -> ../packages/core/src/declared-errors.ts]
[IMPORT: ../packages/core/src/client/creation.ts -> ../packages/core/src/execution.ts]
[IMPORT: ../packages/core/src/client/creation.ts -> ../packages/core/src/middleware.ts]
[IMPORT: ../packages/core/src/client/creation.ts -> ../packages/core/src/object.ts]
[IMPORT: ../packages/core/src/client/creation.ts -> ../packages/core/src/client/integration.ts]
[IMPORT: ../packages/core/src/client/creation.ts -> ../packages/core/src/client/request.ts]
[IMPORT: ../packages/core/src/client/creation.ts -> ../packages/core/src/client/response.ts]
[IMPORT: ../packages/core/src/adapters/errors.ts -> ../packages/core/src/declared-errors.ts]
[IMPORT: ../packages/core/src/adapters/errors.ts -> ../packages/core/src/errors.ts]
[IMPORT: ../packages/core/src/adapters/errors.ts -> ../packages/core/src/server/errors.ts]
[IMPORT: ../packages/core/src/adapters/errors.ts -> ../packages/core/src/validation.ts]
[IMPORT: ../packages/core/src/contract/router.ts -> ../packages/core/src/object.ts]
[IMPORT: ../packages/core/src/contract/router.ts -> ../packages/core/src/contract/paths.ts]
[IMPORT: ../packages/core/src/contract/creation.ts -> ../packages/core/src/compiler.ts]
[IMPORT: ../packages/core/src/contract/creation.ts -> ../packages/core/src/declared-errors.ts]
[IMPORT: ../packages/core/src/contract/creation.ts -> ../packages/core/src/object.ts]
[IMPORT: ../packages/core/src/contract/creation.ts -> ../packages/core/src/contract/paths.ts]
[IMPORT: ../packages/core/src/contract/creation.ts -> ../packages/core/src/contract/route.ts]
[IMPORT: ../packages/core/src/contract/creation.ts -> ../packages/core/src/contract/router.ts]
[IMPORT: ../packages/core/src/adapters/response.ts -> ../packages/core/src/contract/schema.ts]
[IMPORT: ../packages/core/src/adapters/response.ts -> ../packages/core/src/execution.ts]
[IMPORT: ../packages/core/src/adapters/response.ts -> ../packages/core/src/headers.ts]
[IMPORT: ../packages/core/src/adapters/response.ts -> ../packages/core/src/object.ts]
[IMPORT: ../packages/core/src/adapters/response.ts -> ../packages/core/src/server/errors.ts]
[IMPORT: ../packages/core/src/adapters/input.ts -> ../packages/core/src/contract/parameters.ts]
[IMPORT: ../packages/core/src/adapters/input.ts -> ../packages/core/src/contract/query.ts]
[IMPORT: ../packages/core/src/adapters/input.ts -> ../packages/core/src/contract/request.ts]
[IMPORT: ../packages/core/src/adapters/input.ts -> ../packages/core/src/execution.ts]
[IMPORT: ../packages/core/src/adapters/input.ts -> ../packages/core/src/server/errors.ts]
[IMPORT: ../packages/core/src/adapters/input.ts -> ../packages/core/src/validation.ts]
[IMPORT: ../packages/core/src/declared-errors.ts -> ../packages/core/src/object.ts]
[IMPORT: ../packages/core/src/declared-errors.ts -> ../packages/core/src/validation.ts]
[IMPORT: ../packages/core/src/adapters/routing.ts -> ../packages/core/src/object.ts]
[IMPORT: ../packages/core/src/adapters/routing.ts -> ../packages/core/src/server/errors.ts]
[IMPORT: ../packages/core/src/headers.ts -> ../packages/core/src/object.ts]
[IMPORT: ../packages/core/src/contract/schema.ts -> ../packages/core/src/validation.ts]
[IMPORT: ../packages/core/src/contract/schema.ts -> ../packages/core/src/contract/request.ts]
[IMPORT: ../packages/core/src/client/request.ts -> ../packages/core/src/contract/parameters.ts]
[IMPORT: ../packages/core/src/client/request.ts -> ../packages/core/src/contract/query.ts]
[IMPORT: ../packages/core/src/client/request.ts -> ../packages/core/src/contract/request.ts]
[IMPORT: ../packages/core/src/client/request.ts -> ../packages/core/src/execution.ts]
[IMPORT: ../packages/core/src/client/request.ts -> ../packages/core/src/object.ts]
[IMPORT: ../packages/core/src/client/request.ts -> ../packages/core/src/validation.ts]
[IMPORT: ../packages/core/src/contract/parameters.ts -> ../packages/core/src/execution.ts]
[IMPORT: ../packages/core/src/contract/parameters.ts -> ../packages/core/src/object.ts]
[IMPORT: ../packages/core/src/contract/parameters.ts -> ../packages/core/src/validation.ts]
[IMPORT: ../packages/core/src/contract/query.ts -> ../packages/core/src/errors.ts]
[IMPORT: ../packages/core/src/contract/query.ts -> ../packages/core/src/execution.ts]
[IMPORT: ../packages/core/src/contract/query.ts -> ../packages/core/src/object.ts]
[IMPORT: ../packages/core/src/contract/query.ts -> ../packages/core/src/validation.ts]
[IMPORT: ../packages/core/src/compiler.ts -> ../packages/core/src/contract/state.ts]
```

### Reverse Dependencies (Imported By)

```
[IMPORTED_BY: ../packages/core/src/middleware.ts <- ../packages/core/src/server/definition.ts]
[IMPORTED_BY: ../packages/core/src/middleware.ts <- ../packages/core/src/client/definition.ts]
[IMPORTED_BY: ../packages/core/src/middleware.ts <- ../packages/core/src/adapters/runtime.ts]
[IMPORTED_BY: ../packages/core/src/middleware.ts <- ../packages/core/src/server/implementation.ts]
[IMPORTED_BY: ../packages/core/src/middleware.ts <- ../packages/core/src/client/creation.ts]
[IMPORTED_BY: ../packages/core/src/adapters/errors.ts <- ../packages/core/src/adapters/runtime.ts]
[IMPORTED_BY: ../packages/core/src/adapters/errors.ts <- ../packages/core/src/adapters/web.ts]
[IMPORTED_BY: ../packages/core/src/adapters/routing.ts <- ../packages/core/src/adapters/runtime.ts]
[IMPORTED_BY: ../packages/core/src/contract/request.ts <- ../packages/core/src/contract/route.ts]
[IMPORTED_BY: ../packages/core/src/contract/request.ts <- ../packages/core/src/client/response.ts]
[IMPORTED_BY: ../packages/core/src/contract/request.ts <- ../packages/core/src/adapters/input.ts]
[IMPORTED_BY: ../packages/core/src/contract/request.ts <- ../packages/core/src/contract/schema.ts]
[IMPORTED_BY: ../packages/core/src/contract/request.ts <- ../packages/core/src/client/request.ts]
[IMPORTED_BY: ../packages/core/src/adapters/response.ts <- ../packages/core/src/adapters/runtime.ts]
[IMPORTED_BY: ../packages/core/src/adapters/web.ts <- ../packages/core/src/fetch/server.ts]
[IMPORTED_BY: ../packages/core/src/contract/paths.ts <- ../packages/core/src/contract/route.ts]
[IMPORTED_BY: ../packages/core/src/contract/paths.ts <- ../packages/core/src/contract/router.ts]
[IMPORTED_BY: ../packages/core/src/contract/paths.ts <- ../packages/core/src/contract/creation.ts]
[IMPORTED_BY: ../packages/core/src/adapters/body.ts <- ../packages/core/src/fetch/server.ts]
[IMPORTED_BY: ../packages/core/src/adapters/body.ts <- ../packages/core/src/adapters/web.ts]
[IMPORTED_BY: ../packages/core/src/contract/state.ts <- ../packages/core/src/server/definition.ts]
[IMPORTED_BY: ../packages/core/src/contract/state.ts <- ../packages/core/src/client/definition.ts]
[IMPORTED_BY: ../packages/core/src/contract/state.ts <- ../packages/core/src/server/implementation.ts]
[IMPORTED_BY: ../packages/core/src/contract/state.ts <- ../packages/core/src/contract/definition.ts]
[IMPORTED_BY: ../packages/core/src/contract/state.ts <- ../packages/core/src/client/creation.ts]
[IMPORTED_BY: ../packages/core/src/contract/state.ts <- ../packages/core/src/compiler.ts]
[IMPORTED_BY: ../packages/core/src/declared-errors.ts <- ../packages/core/src/adapters/runtime.ts]
[IMPORTED_BY: ../packages/core/src/declared-errors.ts <- ../packages/core/src/client/response.ts]
[IMPORTED_BY: ../packages/core/src/declared-errors.ts <- ../packages/core/src/client/creation.ts]
[IMPORTED_BY: ../packages/core/src/declared-errors.ts <- ../packages/core/src/adapters/errors.ts]
[IMPORTED_BY: ../packages/core/src/declared-errors.ts <- ../packages/core/src/contract/creation.ts]
[IMPORTED_BY: ../packages/core/src/object.ts <- ../packages/core/src/server/definition.ts]
[IMPORTED_BY: ../packages/core/src/object.ts <- ../packages/core/src/contract/response.ts]
[IMPORTED_BY: ../packages/core/src/object.ts <- ../packages/core/src/client/definition.ts]
[IMPORTED_BY: ../packages/core/src/object.ts <- ../packages/core/src/adapters/runtime.ts]
[IMPORTED_BY: ../packages/core/src/object.ts <- ../packages/core/src/server/implementation.ts]
[IMPORTED_BY: ../packages/core/src/object.ts <- ../packages/core/src/contract/state.ts]
[IMPORTED_BY: ../packages/core/src/object.ts <- ../packages/core/src/client/response.ts]
[IMPORTED_BY: ../packages/core/src/object.ts <- ../packages/core/src/client/creation.ts]
[IMPORTED_BY: ../packages/core/src/object.ts <- ../packages/core/src/contract/router.ts]
[IMPORTED_BY: ../packages/core/src/object.ts <- ../packages/core/src/contract/creation.ts]
[IMPORTED_BY: ../packages/core/src/object.ts <- ../packages/core/src/adapters/response.ts]
[IMPORTED_BY: ../packages/core/src/object.ts <- ../packages/core/src/declared-errors.ts]
[IMPORTED_BY: ../packages/core/src/object.ts <- ../packages/core/src/adapters/routing.ts]
[IMPORTED_BY: ../packages/core/src/object.ts <- ../packages/core/src/headers.ts]
[IMPORTED_BY: ../packages/core/src/object.ts <- ../packages/core/src/client/request.ts]
[IMPORTED_BY: ../packages/core/src/object.ts <- ../packages/core/src/contract/parameters.ts]
[IMPORTED_BY: ../packages/core/src/object.ts <- ../packages/core/src/contract/query.ts]
[IMPORTED_BY: ../packages/core/src/client/creation.ts <- ../packages/core/src/client/definition.ts]
[IMPORTED_BY: ../packages/core/src/server/index.ts <- .size-output/hulla-api-source.ts]
[IMPORTED_BY: ../packages/core/src/client/index.ts <- .size-output/hulla-api-source.ts]
[IMPORTED_BY: ../packages/core/src/execution.ts <- ../packages/core/src/adapters/runtime.ts]
[IMPORTED_BY: ../packages/core/src/execution.ts <- ../packages/core/src/client/response.ts]
[IMPORTED_BY: ../packages/core/src/execution.ts <- ../packages/core/src/validation.ts]
[IMPORTED_BY: ../packages/core/src/execution.ts <- ../packages/core/src/client/creation.ts]
[IMPORTED_BY: ../packages/core/src/execution.ts <- ../packages/core/src/adapters/response.ts]
[IMPORTED_BY: ../packages/core/src/execution.ts <- ../packages/core/src/adapters/input.ts]
[IMPORTED_BY: ../packages/core/src/execution.ts <- ../packages/core/src/client/request.ts]
[IMPORTED_BY: ../packages/core/src/execution.ts <- ../packages/core/src/contract/parameters.ts]
[IMPORTED_BY: ../packages/core/src/execution.ts <- ../packages/core/src/contract/query.ts]
[IMPORTED_BY: ../packages/core/src/server/implementation.ts <- ../packages/core/src/server/definition.ts]
[IMPORTED_BY: ../packages/core/src/server/composition.ts <- ../packages/core/src/server/definition.ts]
[IMPORTED_BY: ../packages/core/src/server/composition.ts <- ../packages/core/src/server/implementation.ts]
[IMPORTED_BY: ../packages/core/src/stream.ts <- ../packages/core/src/contract/response.ts]
[IMPORTED_BY: ../packages/core/src/contract/route.ts <- ../packages/core/src/index.ts]
[IMPORTED_BY: ../packages/core/src/contract/route.ts <- ../packages/core/src/contract/creation.ts]
[IMPORTED_BY: ../packages/core/src/client/definition.ts <- ../packages/core/src/client/index.ts]
[IMPORTED_BY: ../packages/core/src/fetch/client.ts <- ../packages/core/src/fetch/index.ts]
[IMPORTED_BY: ../packages/core/src/server/response.ts <- ../packages/core/src/adapters/runtime.ts]
[IMPORTED_BY: ../packages/core/src/client/request.ts <- ../packages/core/src/client/creation.ts]
[IMPORTED_BY: ../packages/core/src/contract/parameters.ts <- ../packages/core/src/adapters/input.ts]
[IMPORTED_BY: ../packages/core/src/contract/parameters.ts <- ../packages/core/src/client/request.ts]
[IMPORTED_BY: ../packages/core/src/index.ts <- .size-output/hulla-api-source.ts]
[IMPORTED_BY: ../packages/core/src/contract/definition.ts <- ../packages/core/src/contract/index.ts]
[IMPORTED_BY: ../packages/core/src/contract/query.ts <- ../packages/core/src/adapters/input.ts]
[IMPORTED_BY: ../packages/core/src/contract/query.ts <- ../packages/core/src/client/request.ts]
[IMPORTED_BY: ../packages/core/src/server/errors.ts <- ../packages/core/src/server/definition.ts]
[IMPORTED_BY: ../packages/core/src/server/errors.ts <- ../packages/core/src/adapters/body.ts]
[IMPORTED_BY: ../packages/core/src/server/errors.ts <- ../packages/core/src/adapters/runtime.ts]
[IMPORTED_BY: ../packages/core/src/server/errors.ts <- ../packages/core/src/server/implementation.ts]
[IMPORTED_BY: ../packages/core/src/server/errors.ts <- ../packages/core/src/adapters/errors.ts]
[IMPORTED_BY: ../packages/core/src/server/errors.ts <- ../packages/core/src/adapters/response.ts]
[IMPORTED_BY: ../packages/core/src/server/errors.ts <- ../packages/core/src/adapters/input.ts]
[IMPORTED_BY: ../packages/core/src/server/errors.ts <- ../packages/core/src/adapters/routing.ts]
[IMPORTED_BY: ../packages/core/src/fetch/index.ts <- .size-output/hulla-api-source.ts]
[IMPORTED_BY: ../packages/core/src/contract/index.ts <- ../packages/core/src/index.ts]
[IMPORTED_BY: ../packages/core/src/validation.ts <- ../packages/core/src/contract/response.ts]
[IMPORTED_BY: ../packages/core/src/validation.ts <- ../packages/core/src/contract/route.ts]
[IMPORTED_BY: ../packages/core/src/validation.ts <- ../packages/core/src/server/errors.ts]
[IMPORTED_BY: ../packages/core/src/validation.ts <- ../packages/core/src/client/response.ts]
[IMPORTED_BY: ../packages/core/src/validation.ts <- ../packages/core/src/contract/request.ts]
[IMPORTED_BY: ../packages/core/src/validation.ts <- ../packages/core/src/adapters/errors.ts]
[IMPORTED_BY: ../packages/core/src/validation.ts <- ../packages/core/src/adapters/input.ts]
[IMPORTED_BY: ../packages/core/src/validation.ts <- ../packages/core/src/declared-errors.ts]
[IMPORTED_BY: ../packages/core/src/validation.ts <- ../packages/core/src/contract/schema.ts]
[IMPORTED_BY: ../packages/core/src/validation.ts <- ../packages/core/src/client/request.ts]
[IMPORTED_BY: ../packages/core/src/validation.ts <- ../packages/core/src/contract/parameters.ts]
[IMPORTED_BY: ../packages/core/src/validation.ts <- ../packages/core/src/contract/query.ts]
[IMPORTED_BY: ../packages/core/src/contract/representation.ts <- ../packages/core/src/contract/response.ts]
[IMPORTED_BY: ../packages/core/src/contract/representation.ts <- ../packages/core/src/contract/request.ts]
[IMPORTED_BY: ../packages/core/src/adapters/input.ts <- ../packages/core/src/adapters/runtime.ts]
[IMPORTED_BY: ../packages/core/src/errors.ts <- ../packages/core/src/server/errors.ts]
[IMPORTED_BY: ../packages/core/src/errors.ts <- ../packages/core/src/client/response.ts]
[IMPORTED_BY: ../packages/core/src/errors.ts <- ../packages/core/src/validation.ts]
[IMPORTED_BY: ../packages/core/src/errors.ts <- ../packages/core/src/adapters/errors.ts]
[IMPORTED_BY: ../packages/core/src/errors.ts <- ../packages/core/src/contract/query.ts]
[IMPORTED_BY: ../packages/core/src/fetch/server.ts <- ../packages/core/src/fetch/index.ts]
[IMPORTED_BY: ../packages/core/src/server/context.ts <- ../packages/core/src/fetch/server.ts]
[IMPORTED_BY: ../packages/core/src/contract/creation.ts <- ../packages/core/src/contract/definition.ts]
[IMPORTED_BY: ../packages/core/src/client/integration.ts <- ../packages/core/src/client/creation.ts]
[IMPORTED_BY: ../packages/core/src/adapters/headers.ts <- ../packages/core/src/fetch/client.ts]
[IMPORTED_BY: ../packages/core/src/adapters/headers.ts <- ../packages/core/src/adapters/web.ts]
[IMPORTED_BY: ../packages/core/src/contract/schema.ts <- ../packages/core/src/client/response.ts]
[IMPORTED_BY: ../packages/core/src/contract/schema.ts <- ../packages/core/src/adapters/response.ts]
[IMPORTED_BY: ../packages/core/src/contract/router.ts <- ../packages/core/src/server/implementation.ts]
[IMPORTED_BY: ../packages/core/src/contract/router.ts <- ../packages/core/src/contract/creation.ts]
[IMPORTED_BY: ../packages/core/src/adapters/runtime.ts <- ../packages/core/src/fetch/server.ts]
[IMPORTED_BY: ../packages/core/src/contract/response.ts <- ../packages/core/src/index.ts]
[IMPORTED_BY: ../packages/core/src/server/definition.ts <- ../packages/core/src/server/index.ts]
[IMPORTED_BY: ../packages/core/src/compiler.ts <- ../packages/core/src/contract/creation.ts]
[IMPORTED_BY: ../packages/core/src/client/response.ts <- ../packages/core/src/fetch/client.ts]
[IMPORTED_BY: ../packages/core/src/client/response.ts <- ../packages/core/src/client/creation.ts]
[IMPORTED_BY: ../packages/core/src/headers.ts <- ../packages/core/src/client/response.ts]
[IMPORTED_BY: ../packages/core/src/headers.ts <- ../packages/core/src/adapters/response.ts]
```

### Entry Points

```
[ENTRY: .size-output/hulla-api-source.ts -> ./hulla-api-source.js (46077 bytes)]
```
