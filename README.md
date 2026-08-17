# @hulla/api

Greenfield implementation of a small directional contract layer for TypeScript APIs. Ordinary Standard Schemas validate identity representations; explicit codecs map between wire and application values. Fetch client/server support is built in, while validator-specific mechanics remain optional.

The active workspace contains the batteries-included [`@hulla/api`](./packages/core) package plus the optional [`@hulla/api-zod`](./packages/zod) integration. The previous implementation remains in [`legacy`](./legacy) for behavioral reference and is excluded from the active workspace.

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
- Standard Schema identity validation and explicit directional codecs
- a built-in Fetch client and server handler over a compiled host-parsed wire runtime
- an advanced `@hulla/api/wire` server-adapter boundary and optional Zod integration package
- optional `@hulla/api/procedure` functions with exact sync/async return types, validation, context, middleware, and structurally identified callable trees
- normalized contract problems and a nested `Date` codec round-trip test

See [`docs/architecture.md`](./docs/architecture.md) for the boundary and request call graph, and
[`docs/server-authoring.md`](./docs/server-authoring.md) for the modular server implementation API. The text-first
request model, repeated query behavior, and Zod codecs are documented in
[`docs/request-transport.md`](./docs/request-transport.md). Client call syntax and its intentionally small transport
boundary are covered in [`docs/client-authoring.md`](./docs/client-authoring.md).
Standalone procedure composition and route-derived schema helpers are covered in
[`docs/procedures.md`](./docs/procedures.md).
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
    query.ts        normalized query cardinality and transport
    request.ts      request representations and MIME matching
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
      runtime.ts    platform-neutral wire routing, execution, and response encoding
    wire.ts         public advanced server-adapter entry point
    validation.ts   Standard Schema validation and directional codecs
  tests/            Contract laws and vertical-slice tests

packages/zod/
  src/              explicit Zod codecs, query inference, and schema composition
```

The publishable packages use the next major version while the root workspace and benchmarks remain private.
