# Next.js

The `@hulla/api-next/server` adapter lets a Next.js Route Handler serve your API. Add it to an App Router project to make the contract's routes available over HTTP.

We'll mount an API at `/api` and try a request. To cache server-side Fetch calls, see [Next.js data and caching](./next-data.md).

## Install the integration

Start with an existing Next.js App Router application, then add the API packages and a supported schema library:

<!-- docs:package-manager -->
```sh
# Bun
bun add @hulla/api @hulla/api-next zod

# npm
npm install @hulla/api @hulla/api-next zod

# pnpm
pnpm add @hulla/api @hulla/api-next zod

# Yarn
yarn add @hulla/api @hulla/api-next zod
```

`@hulla/api-next` has separate `/server` and `/client` entrypoints. Route Handler code imports `/server`; server-side cache policy code imports `/client`. There is no mixed root entrypoint.

## Define an API the application can mount

Keep the contract in shared code. This example declares one read and one mutation under `/api/users`:

```ts
// src/api/contract.ts
import { defineContract, request, response, route, router } from '@hulla/api'
import { z } from 'zod'

const user = z.object({ id: z.string(), name: z.string() })

export const contract = defineContract({
  basePath: '/api',
  routes: {
    users: router('/users', {
      routes: {
        byId: route.get('/:id', {
          params: z.object({ id: z.string() }),
          responses: {
            200: response.json(user),
            404: response.json(z.object({ message: z.string() })),
          },
        }),
        rename: route.patch('/:id', {
          params: z.object({ id: z.string() }),
          body: request.json(z.object({ name: z.string().min(1) })),
          responses: { 200: response.json(user) },
        }),
      },
    }),
  },
})
```

Implement the same route tree in a server-only module:

```ts
// src/api/server.ts
import 'server-only'

import { defineServer } from '@hulla/api/server'
import { contract } from './contract'

const server = defineServer(contract)

export const implementation = server.implement({
  users: {
    byId: ({ params, response }) =>
      params.id === 'ada'
        ? response(200, { id: 'ada', name: 'Ada' })
        : response(404, { message: 'User not found' }),
    rename: ({ params, body, response }) =>
      response(200, { id: params.id, name: body.name }),
  },
})
```

The contract and implementation are ordinary `@hulla/api` values. See [contracts](./contract-authoring.md) and [server implementations](./server-authoring.md) for their full APIs.

## Mount an App Router Route Handler

Create an optional catch-all Route Handler and export the mounted handler under every HTTP method used by the contract:

```ts
// app/api/[[...api]]/route.ts
import { nextAdapter } from '@hulla/api-next/server'
import { implementation } from '@/api/server'

const handler = nextAdapter().mount(implementation)

export { handler as GET, handler as PATCH }
```

There are two routing steps:

1. Next matches the host file `app/api/[[...api]]/route.ts`.
2. `@hulla/api` matches the request method and complete pathname against the mounted contract.

Export each method the contract needs. If the contract declares `HEAD`, export `handler as HEAD`; do not assume `GET` supplies it. When a Route Handler omits `OPTIONS`, Next generates its own `OPTIONS` response and `Allow` header. See Next's [Route Handler reference](https://nextjs.org/docs/app/api-reference/file-conventions/route) for current method behavior.

> Next Route Handlers do not support the custom `QUERY` method. `mount()` rejects any implementation or fragment that contains a `QUERY` route.

Run the Next development server and call the mounted endpoint:

```sh
curl -i http://localhost:3000/api/users/ada
```

The response is the declared `200` variant:

```http
HTTP/1.1 200 OK
content-type: application/json

{"id":"ada","name":"Ada"}
```

An unknown user returns the declared `404` JSON response. A known path with a method that is neither exported by Next nor declared by the contract is handled by the boundary that rejects it first.

## Use native Next request context

Use `nextAdapter().context()` when a handler needs `NextRequest` or the catch-all route parameters:

```ts
// src/api/server.ts
import 'server-only'

import { defineServer } from '@hulla/api/server'
import {
  nextAdapter,
  type NextRouteContext,
} from '@hulla/api-next/server'
import { contract } from './contract'

type ApiRouteContext = NextRouteContext<{
  readonly api?: string[]
}>

export const adapter = nextAdapter<ApiRouteContext>()

const server = defineServer(contract, {
  context: adapter.context(async ({ request, route, routeContext }) => ({
    session: request.cookies.get('session')?.value,
    path: request.nextUrl.pathname,
    catchAll: (await routeContext.params).api,
    operation: route.key,
  })),
})
```

The adapter passes the original `NextRequest`, Next's route context, and the matched contract route to the context factory. The package's `NextRouteContext` type works without generated framework types. If you prefer Next's global `RouteContext<'/api/[[...api]]'>` helper, run `next dev`, `next build`, or `next typegen` first so Next can generate it.

An implementation that declares `adapter.context()` is intentionally bound to the Next adapter. Generic Fetch, Express, and `inProcessTransport()` reject it during setup because they cannot supply `NextRequest` or the route context. Keep context portable when the same implementation must run through more than one adapter.

## Observe adapter failures

Use `onError` for Next-aware logging or to replace the protocol-safe default response:

```ts
const adapter = nextAdapter<ApiRouteContext>({
  onError({ error, phase, request, route, defaultResponse }) {
    console.error(phase, request.nextUrl.pathname, route?.key, error)
    return defaultResponse
  },
})
```

The hook can observe routing, request decoding, context, handler, and response failures. Returning `undefined` keeps `defaultResponse`; returning a `Response` replaces it. Declared `4xx` and `5xx` contract responses are normal results, not adapter failures.

Options passed to `adapter.mount()` override the adapter defaults for that one handler.

## Choose how application code calls the API

Mounting the Route Handler makes the HTTP boundary available; it does not require every caller to use it.

| Caller | Use | Why |
| --- | --- | --- |
| Browser component | A browser-safe `fetchTransport()` client | The browser must call the mounted endpoint |
| Server Component calling another service | A server-only Fetch client with an absolute `baseUrl` | The HTTP service is the intended boundary |
| Server Component colocated with the implementation | `inProcessTransport(implementation)` when context is portable | Avoid an internal HTTP round trip |
| Server code that needs Next Data Cache tags and policy | `createNextCache()` | Add typed Next fetch options to declared `GET` routes |

Read [server and browser calls](./hybrid-rendering.md) before choosing between HTTP and an in-process call. Read [Next.js data and caching](./next-data.md) for `createNextCache()`, Server Components, invalidation, and browser-cache boundaries.

## Scope and runtime compatibility

This adapter targets App Router Route Handlers. Pages Router API Routes use the separate `NextApiRequest` and `NextApiResponse` lifecycle and are not adapted by `nextAdapter()`.

The mounted handler uses Web request and response primitives. It can run in Next's Node.js runtime or Edge runtime only when the implementation and every dependency support the selected runtime. Next owns runtime selection, middleware, deployment, limits, and response delivery; `@hulla/api` owns the contract lifecycle after the Route Handler receives the request.
