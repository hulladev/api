# TanStack Start

`@hulla/api-tanstack-start` mounts a Hulla server implementation in a TanStack Start server route. The contract remains
the API source of truth; Start owns the wildcard host route, request middleware, rendering, loaders, and application
caches.

Use the adapter for a shared or public HTTP boundary: independently deployed clients, generated clients or OpenAPI,
runtime response validation, or an API consumed outside the Start application. Prefer Start's native server functions
for application-local RPC, native loaders for route-local orchestration, and native server routes for one-off framework
endpoints such as OAuth callbacks, webhook byte verification, redirects, or file handling. The package intentionally
does not generate server functions, loaders, query options, middleware, or cache behavior.

## Contract-backed server route

Mount a complete implementation or fragment under one wildcard file route:

```ts
// src/routes/api/$.ts
import { createServerRouteHandlers } from '@hulla/api-tanstack-start/server'
import { createFileRoute } from '@tanstack/react-router'
import { implementation } from '~/api/server'

export const Route = createFileRoute('/api/$')({
  server: {
    handlers: createServerRouteHandlers(implementation),
  },
})
```

The returned object contains one shared handler for each HTTP method selected by the implementation. Start matches the
host route and supplies a native `Request`; Hulla then matches the operation using the contract's complete method and
path, decodes its declared input, runs context and middleware, and serializes a declared response.

The two parameter layers remain separate:

- Start's wildcard `params._splat` identifies the remainder of the host route.
- A Hulla operation handler receives the decoded `params` declared by its contract route.

TanStack Start server routes cannot expose Hulla's `QUERY` method. `createServerRouteHandlers()` rejects an implementation
or fragment containing one instead of silently leaving the operation unreachable.

The optional error hook receives one object containing Hulla's protocol-safe default `Response`, the native request,
Start middleware context, host-route params, and route metadata:

```ts
createServerRouteHandlers(implementation, {
  onError({ error, phase, request, startContext, startParams, defaultResponse }) {
    console.error(phase, request.url, startContext, startParams, error)
    return defaultResponse
  },
})
```

## Native Start context

Use `tanStackStartContext()` when Hulla context construction needs the native request, wildcard params, or context
installed by Start request middleware. Pass the middleware context and host parameter types to the helper:

```ts
import { defineServer } from '@hulla/api/server'
import { tanStackStartContext } from '@hulla/api-tanstack-start/server'

type StartContext = {
  readonly session: { readonly userId: string }
}

type StartParams = {
  readonly _splat: string | undefined
}

const server = defineServer(contract, {
  context: tanStackStartContext<StartContext, StartParams>()(({ request, route, startContext, startParams }) => ({
    operation: route.key,
    session: startContext.session,
    splat: startParams._splat,
    userAgent: request.headers.get('user-agent'),
  })),
})
```

`route` is still the contract-derived operation metadata. The resulting factory is bound to the TanStack Start adapter;
mounting it through Express, Next.js, generic Fetch, or `inProcessTransport()` fails immediately. Use an ordinary Hulla
context factory when it needs only portable route metadata or request-independent services.

## Split large APIs with fragments

A single wildcard route imports the implementation it mounts. For a large API, avoid forcing unrelated route groups
into one server chunk: create independently executable Hulla fragments and mount each fragment under the matching Start
wildcard. Only the selected contract routes are compiled into that fragment.

```ts
// src/api/public.server.ts
import { server } from './definition'
import { contract } from './contract'

export const publicImplementation = server.implement(contract.routes.public, {
  health: () => ({ status: 200, body: 'ok' }),
  users: {
    byId: async ({ params }) => {
      const user = await findPublicUser(params.id)
      return user
        ? { status: 200, body: user }
        : { status: 404, body: { message: 'User not found' } }
    },
  },
})
```

```ts
// src/routes/api/public/$.ts
import { createServerRouteHandlers } from '@hulla/api-tanstack-start/server'
import { createFileRoute } from '@tanstack/react-router'
import { publicImplementation } from '~/api/public.server'

export const Route = createFileRoute('/api/public/$')({
  server: {
    handlers: createServerRouteHandlers(publicImplementation),
  },
})
```

Use separate fragments for groups with different deployment, cold-start, middleware, or ownership requirements. Keep
raw Start routes separate when an endpoint benefits more from Start's native `Request`/`Response` model than from a
shared contract.

## Boundary with Start data APIs

- Route loaders own navigation-time preloading and route-cache behavior. They may call a Hulla client when an existing
  HTTP contract is the data source, but this package adds no loader abstraction.
- TanStack Query owns shared client caching, mutations, optimistic updates, hydration, and invalidation. The existing
  framework-neutral `@hulla/api-tanstack-query` integration can wrap a Hulla client when needed.
- Start server functions own same-origin application RPC and their serialization boundary. Do not wrap them around a
  Hulla HTTP call merely to reuse this adapter; use a native server function for internal operations.
- Start request middleware owns request-wide authentication, logging, and platform context. Declare the Start adapter to
  consume the established context inside contract handlers rather than repeating that work in Hulla middleware.

This keeps one owner for each concern: Start for application execution and data flow, Hulla for shared HTTP contracts.
