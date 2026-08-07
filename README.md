# @hulla/api

Greenfield implementation of a small directional contract layer for TypeScript APIs. Standard Schema input is the wire value, Standard Schema output is the application value, and Fetch performs the HTTP mechanics.

The active workspace intentionally contains one package: [`packages/core`](./packages/core). The previous implementation, examples, release scripts, and in-progress beta metadata are preserved in [`legacy`](./legacy) for behavioral reference, but `legacy/**` is not a workspace and is excluded from builds, tests, linting, formatting, and package output.

## Start here

```bash
bun install
bun run dev         # rebuild the package while editing
bun run test:watch  # run the focused test loop
bun run bench       # measure the Fetch + nested codec vertical slice
bun run check       # CI-equivalent verification
```

The first vertical slice includes:

- `defineContract`, `router`, and method-specific route declarations
- Standard Schema validation with dependency-free defaults and direct Zod 4 codec support
- a transport-neutral server implementation binding for backend adapters
- a Fetch client that mirrors the contract tree
- normalized contract problems and a nested `Date` codec round-trip test

See [`docs/architecture.md`](./docs/architecture.md) for the boundary and request call graph, and
[`docs/server-authoring.md`](./docs/server-authoring.md) for the modular server implementation API. The text-first
request model, repeated query behavior, and Zod codecs are documented in
[`docs/request-transport.md`](./docs/request-transport.md).

## Package layout

```text
packages/core/
  src/
    client.ts       Fetch client binding
    contract.ts     API and route declarations
    query.ts        normalized query cardinality and transport
    request.ts      request representations and MIME matching
    representation.ts shared intrinsic wire schemas
    response.ts     response representation declarations
    server/
      index.ts      public server authoring entry point
      context.ts    server context primitives
      middleware.ts typed middleware actions and contract-error inference
      response.ts   typed handler and middleware results
      types.ts      handler fragments and implementation types
      definition.ts fragment validation and assembly
      errors.ts     internal server and validation errors
    validation.ts   Standard Schema validation and directional codecs
    zod.ts          optional Zod text codecs
  tests/            Contract laws and vertical-slice tests
```

The package is marked private during the rewrite so a partial API cannot be published accidentally. Remove `private` and establish a release policy only when the public surface is ready.
