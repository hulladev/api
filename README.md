# @hulla/api

Greenfield implementation of a small directional contract layer for TypeScript APIs. Contracts accept any Standard Schema directly for one-way validation and expose an explicit validator-neutral codec when client and server should share an application value. Fetch client/server support is built in without validator-specific adapters.

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
- a built-in Fetch client and server handler over a compiled host-parsed wire runtime
- capability-inferred client/server/procedure plugins plus TanStack Query and SWR helpers
- an advanced `@hulla/api/wire` server-adapter boundary
- optional `@hulla/api/procedure` functions with exact sync/async return types, validation, context, middleware, and structurally identified callable trees
- normalized contract problems and bidirectional codec coverage across every HTTP representation

See [`docs/architecture.md`](./docs/architecture.md) for the boundary and request call graph, and
[`docs/server-authoring.md`](./docs/server-authoring.md) for the modular server implementation API. The text-first
request model, flat and repeated query behavior, and codecs are documented in
[`docs/request-transport.md`](./docs/request-transport.md). Client call syntax and its intentionally small transport
boundary are covered in [`docs/client-authoring.md`](./docs/client-authoring.md).
Standalone procedure composition and route-derived schema helpers are covered in
[`docs/procedures.md`](./docs/procedures.md).
Plugin targets, authoring hooks, keys, and the TanStack Query/SWR helpers are covered in
[`docs/plugins.md`](./docs/plugins.md).
Structured operational errors, Standard Schema issue compatibility, and protocol problem conversion are covered in
[`docs/errors.md`](./docs/errors.md).

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
    procedure.ts    application procedures and callable registries
    client/         built-in Fetch client authoring and execution
    server/
      index.ts      public server authoring entry point
      context.ts    server context primitives
      middleware.ts direct middleware continuations and contract-error types
      response.ts   status-discriminated handler and middleware results
      types.ts      complete handler-tree and implementation types
      definition.ts context, middleware scope, and complete-tree assembly
      errors.ts     internal server and validation errors
      fetch.ts      built-in Request/Response adapter
      runtime.ts    standard-Request wire execution, published as the advanced adapter entry point
    validation.ts   Standard Schema execution plans and explicit codecs
  tests/            Contract laws and vertical-slice tests
```

The publishable package uses the next major version while the root workspace and benchmarks remain private.
