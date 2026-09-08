# TanStack Start

For the recommended local/browser setup and enforced module boundaries, see [hybrid rendering](./hybrid-rendering.md). Its examples link to the production-build fixtures used by this integration.

`@hulla/api-tanstack-start` mounts an `@hulla/api` server implementation in a TanStack Start server route. The contract remains
the API source of truth; Start owns the wildcard host route, request middleware, rendering, loaders, and application
caches.

Use the adapter for a shared or public HTTP boundary: independently deployed clients, generated clients or OpenAPI,
runtime response validation, or an API consumed outside the Start application. Prefer Start's native server functions
for application-local RPC, native loaders for route-local orchestration, and native server routes for one-off framework
endpoints such as OAuth callbacks, webhook byte verification, redirects, or file handling. The package intentionally
does not generate server functions, loaders, query options, middleware, or cache behavior.

## Prerequisites

This guide starts at the adapter boundary. First define the shared contract from
[contract authoring](./contract-authoring.md), then turn it into the server value mounted below:

```ts
// src/api/server.ts
import { defineServer } from '@hulla/api/server'
import { contract } from './contract'

const server = defineServer(contract)

export const implementation = server.implement({
  health: ({ response }) => response(200, 'ok'),
  users: {
    byId: ({ params, response }) => response(200, { id: params.id, name: 'Ada' }),
    rename: ({ params, body, response }) => response(200, { id: params.id, name: body.name }),
  },
})
```

`defineServer(contract)` creates the server authoring scope. `implement()` requires the handler tree to cover the
contract and returns the complete `implementation` accepted by `mount()`. See
[server authoring](./server-authoring.md) for context, middleware, declared errors, and independently deployable
fragments.

## Contract-backed server route

Mount a complete implementation or fragment under one wildcard file route:

```ts
// src/routes/api/$.ts
import { tanStackStartAdapter } from '@hulla/api-tanstack-start'
import { createFileRoute } from '@tanstack/react-router'
import { implementation } from '~/api/server'

export const Route = createFileRoute('/api/$')({
  server: {
    handlers: tanStackStartAdapter().mount(implementation),
  },
})
```

The returned object contains one shared handler for each HTTP method selected by the implementation. Start matches the
host route and supplies a native `Request`; `@hulla/api` then matches the operation using the contract's complete method and
path, decodes its declared input, runs context and middleware, and serializes a declared response.

The two parameter layers remain separate:

- Start's wildcard `params._splat` identifies the remainder of the host route.
- An `@hulla/api` operation handler receives the decoded `params` declared by its contract route.

TanStack Start server routes cannot expose `@hulla/api`'s `QUERY` method. `mount()` rejects an implementation
or fragment containing one instead of silently leaving the operation unreachable.

Set the optional error hook once on the adapter to reuse it for every mounted fragment. It receives one object containing
`@hulla/api`'s protocol-safe default `Response`, the native request, Start middleware context, host-route params, and route
metadata:

```ts
const adapter = tanStackStartAdapter<StartContext, StartParams>({
  onError({ error, phase, request, startContext, startParams, defaultResponse }) {
    console.error(phase, request.url, startContext, startParams, error)
    return defaultResponse
  },
})

const handlers = adapter.mount(implementation)
```

Options passed to `mount()` shallowly override the adapter defaults for that handler map.

## Consume the API from Start

The server-route adapter does not replace TanStack Router's data APIs. Create the ordinary client once and use its route
calls inside loaders, which continue to own navigation preloading and route-cache behavior:

```ts
// src/api/client.ts
import { defineClient } from '@hulla/api/client'
import { fetchTransport } from '@hulla/api/fetch'
import { contract } from './contract'

const baseUrl: string | undefined = import.meta.env.VITE_API_ORIGIN

if (typeof window === 'undefined' && (!baseUrl || !URL.canParse(baseUrl))) {
  throw new Error('VITE_API_ORIGIN must be an absolute URL during SSR')
}

export const api = defineClient(contract, {
  transport: fetchTransport({ baseUrl }),
})
```

```tsx
// src/routes/users/$id.tsx
import { createFileRoute } from '@tanstack/react-router'
import { api } from '~/api/client'

export const Route = createFileRoute('/users/$id')({
  loader: async ({ params }) => {
    const result = await api.users.byId({ params: { id: params.id } })

    if (result.status !== 200) {
      throw new Error(`Could not load user: ${result.status}`)
    }

    return result.body
  },
  component: UserPage,
})

function UserPage() {
  const user = Route.useLoaderData()
  return <h1>{user.name}</h1>
}
```

An omitted `baseUrl` is appropriate for browser-only calls. Loaders can run during SSR, where Fetch requires an
absolute origin, so configure the public API origin for an isomorphic loader. Authenticated server-side calls must also
forward only the required credentials; a server-side fetch does not inherit the incoming browser request's cookies.

For data shared outside one route, wrap the same client with `createTanStackQuery()` from
`@hulla/api-tanstack-query`, pass its `queryOptions()` to `ensureQueryData()` in the loader and `useSuspenseQuery()` in
the component, and use its `mutationOptions()` for writes. TanStack Query remains responsible for caching, hydration,
optimistic updates, and invalidation.

## Native Start context

Use `tanStackStartAdapter()` when `@hulla/api` context construction needs the native request, wildcard params, or context
installed by Start request middleware. Pass the middleware context and host parameter types to the helper:

```ts
import { defineServer } from '@hulla/api/server'
import { tanStackStartAdapter } from '@hulla/api-tanstack-start'

type StartContext = {
  readonly session: { readonly userId: string }
}

type StartParams = {
  readonly _splat: string | undefined
}

const adapter = tanStackStartAdapter<StartContext, StartParams>()
const server = defineServer(contract, {
  context: adapter.context(({ request, route, startContext, startParams }) => ({
    operation: route.key,
    session: startContext.session,
    splat: startParams._splat,
    userAgent: request.headers.get('user-agent'),
  })),
})
```

`route` is still the contract-derived operation metadata. The resulting factory is bound to the TanStack Start adapter;
mounting it through Express, Next.js, generic Fetch, or `inProcessAdapter().mount()` fails immediately. Use an ordinary
context factory when it needs only portable route metadata or request-independent services.

## Split large APIs with fragments

A single wildcard route imports the implementation it mounts. For a large API, avoid forcing unrelated route groups
into one server chunk: create independently executable `@hulla/api` fragments and mount each fragment under the matching Start
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
import { tanStackStartAdapter } from '@hulla/api-tanstack-start'
import { createFileRoute } from '@tanstack/react-router'
import { publicImplementation } from '~/api/public.server'

export const Route = createFileRoute('/api/public/$')({
  server: {
    handlers: tanStackStartAdapter().mount(publicImplementation),
  },
})
```

Use separate fragments for groups with different deployment, cold-start, middleware, or ownership requirements. Keep
raw Start routes separate when an endpoint benefits more from Start's native `Request`/`Response` model than from a
shared contract.

## Boundary with Start data APIs

- Route loaders own navigation-time preloading and route-cache behavior. They may call an `@hulla/api` client when an existing
  HTTP contract is the data source, but this package adds no loader abstraction.
- TanStack Query owns shared client caching, mutations, optimistic updates, hydration, and invalidation. The existing
  framework-neutral `@hulla/api-tanstack-query` integration can wrap an `@hulla/api` client when needed.
- Start server functions own same-origin application RPC and their serialization boundary. Do not wrap them around a
  `@hulla/api` HTTP call merely to reuse this adapter; use a native server function for internal operations.
- Start request middleware owns request-wide authentication, logging, and platform context. Declare the Start adapter to
  consume the established context inside contract handlers rather than repeating that work in `@hulla/api` middleware.

This keeps one owner for each concern: Start for application execution and data flow, `@hulla/api` for shared HTTP contracts.
