# @hulla/api

Greenfield implementation of a small directional contract layer for TypeScript APIs. Contracts accept any Standard Schema directly for one-way validation and expose an explicit validator-neutral codec when client and server should share an application value. Client and server authoring stay transport-neutral; optional transports include `@hulla/api/fetch`, `@hulla/api/in-process`, and the separately installed `@hulla/api-message-port` package.

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
- an optional `@hulla/api-message-port` package for workers, Electron, and custom ordered IPC endpoints
- explicit TanStack Query and SWR client wrappers with no core plugin hooks
- an advanced `@hulla/api/adapters` server-adapter boundary
- a dependency-free `@hulla/api-node-http` integration with native request/response context and streaming backpressure
- a streaming `@hulla/api-express` server integration for complete implementations and route fragments
- a native-routing `@hulla/api-fastify` integration with typed request, reply, hooks, and plugin encapsulation
- a native-routing `@hulla/api-hono` integration with typed Hono context, bindings, and variables
- a native-routing `@hulla/api-h3` integration with typed H3 events, middleware, and multi-runtime deployment
- a native-routing `@hulla/api-elysia` integration with typed Elysia context, decorators, and stores
- a Module Worker `@hulla/api-cloudflare` integration with typed bindings and execution context
- a `@hulla/api-cloudflare/pages` integration for Pages Functions file routing, middleware data, and asset fallback access
- an API Gateway HTTP API v2 and Function URL `@hulla/api-aws-lambda` integration
- an Azure Functions Node.js v4 HTTP trigger `@hulla/api-azure-functions` integration
- a Google Cloud Run functions HTTP `@hulla/api-google-cloud-functions` integration
- a Web-native `@hulla/api-netlify-functions` integration with typed Netlify context
- an App Router and Data Cache-aware `@hulla/api-next` integration for Next.js
- a contract-backed `@hulla/api-tanstack-start` wildcard server-route integration for TanStack Start
- a contract-backed `@hulla/api-react-router` resource-route integration for React Router v7 Framework Mode
- a SolidStart v2 `@hulla/api-solid-start` catch-all API-route integration with native event context
- a SvelteKit `@hulla/api-sveltekit` integration for catch-all endpoints and zero-hop remote functions with native request-event context
- a Nuxt `@hulla/api-nuxt` integration for Nitro catch-all routes and request-aware `useAsyncData` clients
- an Astro `@hulla/api-astro` integration for catch-all endpoints and zero-hop SSR/server-island calls
- optional `@hulla/api/procedure` functions with exact sync/async return types, validation, context, and middleware
- normalized contract problems and bidirectional codec coverage across every HTTP representation
- bidirectional OpenAPI generation with typed development-only documentation sidecars and optional JSDoc extraction

## Client consumption

Server adapters do not change the client API. Create the contract-shaped client with the transport appropriate for the
consumer, then call its routes from that application's loader, resource, query, or state layer:

```ts
import { defineClient } from '@hulla/api/client'
import { fetchTransport } from '@hulla/api/fetch'
import { contract } from './api/contract'

const api = defineClient(contract, {
  transport: fetchTransport({ baseUrl: 'https://api.example.com' }),
})

const result = await api.users.byId({ params: { id: 'user-1' } })

if (result.status === 200) {
  result.body
}
```

The result is a status-discriminated union of the responses declared by that route. Framework integrations remain
outside the client: Solid Router, TanStack Router, Next.js, TanStack Query, SWR, or another consumer continues to own
loading state, caching, mutations, hydration, and invalidation.

See [`docs/architecture.md`](./docs/architecture.md) for the boundary and request call graph,
[`docs/contract-authoring.md`](./docs/contract-authoring.md) for declaring the shared HTTP contract, and
[`docs/server-authoring.md`](./docs/server-authoring.md) for the modular server implementation API. The text-first
request model, flat and repeated query behavior, and codecs are documented in
[`docs/request-transport.md`](./docs/request-transport.md). Client call syntax and its intentionally small transport
boundary are covered in [`docs/client-authoring.md`](./docs/client-authoring.md).
Worker, Electron, and custom desktop IPC setup is covered in
[`docs/message-port.md`](./docs/message-port.md).
Standalone procedure composition and route-derived schema helpers are covered in
[`docs/procedures.md`](./docs/procedures.md).
Explicit TanStack Query/SWR client integrations are covered in
[`docs/plugins.md`](./docs/plugins.md).
Structured operational errors, Standard Schema issue compatibility, and protocol problem conversion are covered in
[`docs/errors.md`](./docs/errors.md).
Bidirectional OpenAPI generation, typed sidecars, docstrings, and drift checks are covered in
[`docs/openapi.md`](./docs/openapi.md).
Dependency-free Node.js HTTP deployment is covered in [`docs/node-http.md`](./docs/node-http.md).
Express server deployment is covered in [`docs/express.md`](./docs/express.md).
Fastify native routing, hooks, context, and plugin encapsulation are covered in
[`docs/fastify.md`](./docs/fastify.md).
Hono native routing, middleware, context, and multi-runtime deployment are covered in [`docs/hono.md`](./docs/hono.md).
H3 v2 native routing, middleware, event context, and multi-runtime deployment are covered in
[`docs/h3.md`](./docs/h3.md).
Elysia native routing, lifecycle, context, and deployment are covered in [`docs/elysia.md`](./docs/elysia.md).
Cloudflare Module Workers and Pages Functions, including native context, file routing, and fallback boundaries, are covered in
[`docs/cloudflare.md`](./docs/cloudflare.md).
AWS Lambda HTTP API v2 and Function URL deployment is covered in
[`docs/aws-lambda.md`](./docs/aws-lambda.md).
Azure Functions v4 HTTP trigger deployment is covered in
[`docs/azure-functions.md`](./docs/azure-functions.md).
Google Cloud Run functions HTTP deployment is covered in
[`docs/google-cloud-functions.md`](./docs/google-cloud-functions.md).
Netlify Functions routing, native context, and Web handler deployment are covered in
[`docs/netlify-functions.md`](./docs/netlify-functions.md).
Next.js Route Handlers, server-side and client-side consumption, caching, and Server Action composition are covered in
[`docs/next.md`](./docs/next.md).
TanStack Start contract-backed server routes, loader consumption, native context, framework boundaries, and fragment deployment are covered in
[`docs/tanstack-start.md`](./docs/tanstack-start.md).
React Router v7 resource routes, loaders and actions, native load context, and fragment deployment are covered in
[`docs/react-router.md`](./docs/react-router.md).
SolidStart v2 API routes, Solid Router consumption, native request-event state, and full-stack framework boundaries are covered in
[`docs/solid-start.md`](./docs/solid-start.md).
SvelteKit endpoints, remote functions, enhanced Fetch consumption, native request-event state, and full-stack framework boundaries are covered in
[`docs/sveltekit.md`](./docs/sveltekit.md).
Nuxt/Nitro server routes, `useAsyncData`, request-aware fetching, native H3 context, and framework boundaries are covered in
[`docs/nuxt.md`](./docs/nuxt.md).
Astro endpoints, native render context, colocated SSR calls, and deferred server islands are covered in
[`docs/astro.md`](./docs/astro.md).

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
    message-port/   MessagePort and ordered IPC client/server transport
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
packages/node-http/ dependency-free Node.js HTTP server adapter over the catch-all route runtime
packages/express/   native-routing Express server adapter over the route runtime
packages/fastify/   native-routing Fastify server adapter over the route runtime
packages/hono/      native-routing Hono server adapter over the route runtime
packages/h3/        native-routing H3 v2 server adapter over the route runtime
packages/elysia/    native-routing Elysia server adapter over the route runtime
packages/cloudflare/ Cloudflare Module Worker and Pages Functions adapters over the Fetch runtime
packages/aws-lambda/ AWS Lambda HTTP API v2 and Function URL adapter
packages/azure-functions/ Azure Functions v4 HTTP trigger adapter
packages/google-cloud-functions/ Google Cloud Run functions HTTP adapter
packages/netlify-functions/ Netlify Web-native synchronous Functions adapter
packages/next/      Next.js App Router handler and extended Fetch transport helpers
packages/tanstack-start/ TanStack Start wildcard server-route adapter
packages/react-router/ React Router v7 Framework Mode resource-route adapter
packages/solid-start/ SolidStart v2 catch-all API-route adapter
packages/sveltekit/ SvelteKit catch-all endpoint adapter
packages/nuxt/      Nuxt/Nitro server-route and request-aware client adapters
packages/astro/     Astro endpoint and explicit-context in-process adapters
```

The publishable package uses the next major version while the root workspace and benchmarks remain private.

See the [migration guide](./docs/migration.md) for executable client scopes, explicit composition, response headers and request lifetime changes.
