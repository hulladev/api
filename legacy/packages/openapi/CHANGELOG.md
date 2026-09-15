# @hulla/api-openapi

## 2.0.0-beta.1

### Patch Changes

- Updated dependencies
  - @hulla/api@2.0.0-beta.1

## 2.0.0-beta.0

### Minor Changes

- 4b9c751: Replace implicit procedure RPC with explicit typed HTTP routes, router presets, and method/path-aware generated clients. Add server-only Drizzle plugins, reusable `defineTable()` validation, opt-in CRUD presets and bulk generation, shared plugin namespaces, TanStack DB collection builders, and renamed official plugin factories and adapters.

  Rename the API authoring factory from `init()` to `createApi()`. Finalized procedures and generated client routes are directly callable, while core metadata and plugin integrations use framework-owned `$` namespaces. Generated output now exposes `createClient()` consistently instead of exporting a separate eager `api` singleton.

  Allow `.input(...)` to accept multiple schemas as positional arguments, including optional trailing arguments. Drizzle CRUD updates now expose the selector separately as `update(id, patch)`.

  Replace tagged HTTP values and heuristic coercion with conventional readable path segments, query parameters, JSON request/response bodies, and a generated versioned HTTP wire contract shared by the client and server. Contract-free handlers use strict URL-string and ordinary JSON semantics. Server-side schemas validate each deterministically decoded procedure input exactly once.

  Add `HTTPContract`, recursive HTTP wire descriptors, `httpWire()`, `generate({ schemaConverters })`, and the optional `zodWireSchemaConverter()` export. Generated server entries expose contracts by source name for explicit handler mounting.

  Deduplicate equivalent path, body, and query fields while rejecting mismatches with `409 INPUT_CONFLICT`. Generated HTTP and OpenAPI clients now share one `HullaAPIError`, and modular OpenAPI output removes obsolete generator-owned files through a safe manifest.

  Use the Express adapter directly for Nest's default Express platform instead of publishing a separate alias package.

  Harden plugin namespaces against prototype mutation, reject ambiguous route patterns and unsupported OpenAPI transports, and make generated output replacement ownership-aware through `.hulla/manifest.json`. HTTP dispatch now maps only package-owned transport and input failures while allowing application errors to propagate to the host. Nullable boolean archives treat `null` as active, and generated CRUD rejects empty update patches.

  Add a browser-safe `@hulla/api/runtime` entry for generated clients and keep generation-only path helpers out of client plugin bundles.

  Generate valid type-only router aliases for handwritten router discovery so browser clients retain server procedure types without runtime-importing the backend modules.

  Generate customizable TanStack DB collection and collection-option factories for opted-in hand-written CRUD routers and TanStack-enabled Drizzle sources. Generated collections live beside their router at `$tanstack.collection`, client runtimes expose `$dispose()`, and applications provide their own query client or override non-structural collection options.

  Infer TanStack DB collection keys from local Drizzle `crud(table)` presets, including aliased primary-key selections, while retaining explicit keys for metadata-free routers and `collections: false` as an opt-out.

  Add request-scoped cancellation and header overrides to generated clients, dynamic default-header providers, structured typed error narrowing, and automatic TanStack Query abort propagation. Query options for input procedures now require the input when they are created so their key and query function cannot diverge.

  Preserve exact HTTP method and path literals in route metadata, reject underspecified path inputs at compile time, and compile route dispatch into path-shape buckets instead of scanning every exposed procedure per request.

  Publish the `@hulla/api/plugin` authoring entrypoint and the `hulla api` CLI with safe config initialization, TypeScript config loading, atomic generation, and watch mode. Add built-package checks for CommonJS, ESM, Node16, NodeNext, and bundler consumers.

### Patch Changes

- Updated dependencies [4b9c751]
  - @hulla/api@2.0.0-beta.0
