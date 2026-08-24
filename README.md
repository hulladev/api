# @hulla/api

Greenfield implementation of a small directional contract layer for TypeScript APIs. Contracts accept any Standard Schema directly for one-way validation and expose an explicit validator-neutral codec when client and server should share an application value. Client and server authoring stay transport-neutral; Fetch support is provided by `@hulla/api/fetch`.

The active workspace contains the batteries-included [`@hulla/api`](./packages/core) package. Zod, Valibot, and other Standard Schema implementations remain application dependencies. The previous implementation remains in [`legacy`](./legacy) for behavioral reference and is excluded from the active workspace.

## Start here

```bash
bun install
bun run dev         # rebuild the package while editing
bun run test:watch  # run the focused test loop
bun run bench       # compare the standalone runtime matrix and write a detailed report
bun run check       # CI-equivalent verification
```

The first vertical slice includes:

- `defineContract`, `router`, and method-specific route declarations
- a canonical immutable compiled route manifest for runtimes, adapters, and generators
- native directional Standard Schemas and explicit bidirectional codecs without validator configuration
- a transport-neutral client runtime plus an opt-in `@hulla/api/fetch` transport and server adapter
- an opt-in `@hulla/api/in-process` transport for colocated clients and servers
- explicit TanStack Query and SWR client wrappers with no core plugin hooks
- an advanced `@hulla/api/adapters` server-adapter boundary
- a streaming `@hulla/api-express` server integration for complete implementations and route fragments
- an App Router and Data Cache-aware `@hulla/api-next` integration for Next.js
- a contract-backed `@hulla/api-tanstack-start` wildcard server-route integration for TanStack Start
- optional `@hulla/api/procedure` functions with exact sync/async return types, validation, context, and middleware
- normalized contract problems and bidirectional codec coverage across every HTTP representation
- bidirectional OpenAPI generation with typed development-only documentation sidecars and optional JSDoc extraction

See [`docs/architecture.md`](./docs/architecture.md) for the boundary and request call graph, and
[`docs/server-authoring.md`](./docs/server-authoring.md) for the modular server implementation API. The text-first
request model, flat and repeated query behavior, and codecs are documented in
[`docs/request-transport.md`](./docs/request-transport.md). Client call syntax and its intentionally small transport
boundary are covered in [`docs/client-authoring.md`](./docs/client-authoring.md).
Standalone procedure composition and route-derived schema helpers are covered in
[`docs/procedures.md`](./docs/procedures.md).
Explicit TanStack Query/SWR client integrations are covered in
[`docs/plugins.md`](./docs/plugins.md).
Structured operational errors, Standard Schema issue compatibility, and protocol problem conversion are covered in
[`docs/errors.md`](./docs/errors.md).
Bidirectional OpenAPI generation, typed sidecars, docstrings, and drift checks are covered in
[`docs/openapi.md`](./docs/openapi.md).
Express server deployment is covered in [`docs/express.md`](./docs/express.md).
Next.js Route Handlers, server-side fetching, caching, and Server Action composition are covered in
[`docs/next.md`](./docs/next.md).
TanStack Start contract-backed server routes, native context, framework boundaries, and fragment deployment are covered in
[`docs/tanstack-start.md`](./docs/tanstack-start.md).

## Package layout

```text
packages/core/
  src/
    context.ts      shared context and route metadata primitives
    compiler.ts     canonical flat contract manifest for runtimes and integrations
    contract.ts     API and route declarations
    errors.ts       shared structured errors and protocol problem conversion
    execution.ts    sync-preserving execution steps and mapping
    input.ts        shared route input type derivation
    middleware.ts   shared middleware primitives and runtime guards
    object.ts       safe record and tree utilities
    parameters.ts   shared client/server path parameter transport
    query.ts        schema-neutral flat query transport
    request.ts      request representations and MIME normalization
    representation.ts shared intrinsic wire schemas
    response.ts     response representation declarations
    procedure.ts    optional validated application functions
    fetch/          Fetch transport and Request/Response adapter subpath
    client/         transport-neutral client authoring and execution
    server/
      index.ts      public server authoring entry point
      context.ts    server context primitives
      middleware.ts direct middleware continuations and contract-error types
      response.ts   status-discriminated handler and middleware results
      types.ts      handler-tree, fragment, and implementation types
      definition.ts context, middleware scope, and complete-tree assembly
      errors.ts     internal server and validation errors
    adapters/
      index.ts      low-level adapter entry point
      runtime.ts    shared route execution and catch-all matching
    validation.ts   Standard Schema execution plans and explicit codecs
  tests/            Contract laws and vertical-slice tests
packages/openapi/   OpenAPI exporter, importer, typed sidecars, docstrings, and CLI
packages/express/   native-routing Express server adapter over the route runtime
packages/next/      Next.js App Router handler and extended Fetch transport helpers
packages/tanstack-start/ TanStack Start wildcard server-route adapter
```

The publishable package uses the next major version while the root workspace and benchmarks remain private.
