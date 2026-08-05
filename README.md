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

- `defineApi`, `router`, and method-specific route declarations
- Standard Schema validation with dependency-free defaults and direct Zod 4 codec support
- a Fetch server binder with startup route compilation
- a Fetch client that mirrors the contract tree
- normalized contract problems and a nested `Date` codec round-trip test

See [`docs/architecture.md`](./docs/architecture.md) for the boundary and request call graph.

## Package layout

```text
packages/core/
  src/
    client.ts       Fetch client binding
    contract.ts     API and route declarations
    errors.ts       Stable problem/error types
    validation.ts   Standard Schema validation and directional codecs
    server.ts       Fetch server binding
    shared/         Startup compilation and HTTP helpers
  tests/            Contract laws and vertical-slice tests
```

The package is marked private during the rewrite so a partial API cannot be published accidentally. Remove `private` and establish a release policy only when the public surface is ready.
