# @hulla/api

A typed HTTP contract library and integration ecosystem for TypeScript APIs. Contracts accept any Standard Schema directly for one-way validation and expose an explicit validator-neutral codec when client and server should share an application value. Client and server authoring stay transport-neutral; optional transports include `@hulla/api/fetch`, `@hulla/api/in-process`, and the separately installed `@hulla/api-message-port` and `@hulla/api-websocket` packages.

The active workspace contains the batteries-included [`@hulla/api`](./packages/core) package. Zod, Valibot, and other Standard Schema implementations remain application dependencies. The previous implementation remains in [`legacy`](./legacy) for behavioral reference and is excluded from the active workspace.

## Start here

```bash
bun install
bun run dev         # rebuild the package while editing
bun run test:watch  # run the focused test loop
bun run bench       # compare the standalone runtime matrix and write a detailed report
bun run check       # CI-equivalent verification
```

The ecosystem includes:

- `defineContract`, `router`, and method-specific route declarations
- a canonical immutable compiled route manifest for runtimes, adapters, and generators
- native directional Standard Schemas and explicit bidirectional codecs without validator configuration
- a transport-neutral client runtime plus an opt-in `@hulla/api/fetch` transport and server adapter
- an opt-in `@hulla/api/in-process` transport for colocated clients and servers
- an optional `@hulla/api-message-port` package for workers, Electron, and custom ordered IPC endpoints
- explicit TanStack Query and SWR client wrappers with no core plugin hooks
- an advanced `@hulla/api/adapters` server-adapter boundary
- a dependency-free `@hulla/api-node/http` integration with native request/response context and streaming backpressure
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
- normalized contract problems and bidirectional codec coverage across every HTTP representation
- bidirectional OpenAPI generation with typed development-only documentation sidecars and optional JSDoc extraction

## Client consumption

Server adapters do not change the client API. Create the contract-shaped client with the transport appropriate for the
consumer, then call its routes from that application's loader, resource, query, or state layer:

```ts
import { createClient } from '@hulla/api/client'
import { fetchTransport } from '@hulla/api/fetch'
import { contract } from './api/contract'

const api = createClient(contract, {
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

JSON declarations make runtime work explicit: `response.json<User>()` supplies static types and uses native JSON; `response.json(userSchema)` validates and transforms on the server; `response.json(userCodec)` converts and validates. Request bodies follow the same pattern with `request.json()`. Type arguments alone do not validate data.

See [`docs/architecture.md`](./docs/architecture.md) for the boundary and request call graph,
[`docs/contract-authoring.md`](./docs/contract-authoring.md) for declaring the shared HTTP contract, and
[`docs/server-authoring.md`](./docs/server-authoring.md) for the modular server implementation API. The text-first
request model, flat and repeated query behavior, and codecs are documented in
[`docs/request-transport.md`](./docs/request-transport.md). Client call syntax and its intentionally small transport
boundary are covered in [`docs/client-authoring.md`](./docs/client-authoring.md).
Worker, Electron, and custom desktop IPC setup is covered in
[`docs/message-port.md`](./docs/message-port.md).
Use ordinary functions for application logic. Use a selected in-process client when local calls need the HTTP contract lifecycle.
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

## Core layout

The [architecture guide](./docs/architecture.md) explains the request lifecycle and ownership boundaries.

```text
packages/core/src/
  contract/     declarations, inherited paths, query encoding, and schema helpers
  compiler.ts   immutable route manifest for runtime preparation and reflection
  client/       typed calls, contract selections, middleware, and response decoding
  server/       handler authoring, context, and exhaustive server composition
  adapters/     one async route executor, matching, input decoding, and output encoding
  fetch/        Fetch request/response transport and server mounting
  in-process/   direct client/server transport without network serialization
  validation.ts Standard Schema validation and explicit bidirectional codecs
  execution.ts  schema execution and ordered field processing
  stream.ts     streaming formats and incremental decoding
```

Framework integrations, OpenAPI tooling, query integrations, MessagePort, and WebSocket transports live in separate
`packages/*` directories. See the linked guides above for each integration.

The publishable package uses the next major version while the root workspace and benchmarks remain private.

See the [migration guide](./docs/migration.md) for direct client construction, contract selections, response headers and request lifetime changes.

For safe server/browser client setup across frameworks, see [hybrid rendering](./docs/hybrid-rendering.md).

NestJS integrates through the separate [`@hulla/api-nestjs`](./docs/nestjs.md) package.
See [WebSocket transport](./docs/websocket.md) and [Bun, Deno and Vercel runtime fixtures](./docs/runtime-hosts.md) for the other runtime integrations.

Koa middleware is available through [`@hulla/api-koa`](./docs/koa.md).
[Desktop bridges](./docs/desktop-bridges.md) cover Electron ports, Tauri channels and Dioxus eval messaging.
