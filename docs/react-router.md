# React Router v7

For the recommended local/browser setup and enforced module boundaries, see [hybrid rendering](./hybrid-rendering.md). Its examples link to the production-build fixtures used by this integration.

`@hulla/api-react-router` mounts an `@hulla/api` server implementation in a React Router v7 Framework Mode resource
route. React Router owns the host route, request middleware, rendering, loaders, actions, and revalidation;
`@hulla/api` owns the shared HTTP contract, request decoding, server middleware and handler execution, and declared
response serialization.

Use this adapter for an HTTP boundary shared with independently deployed clients, mobile applications, generated
clients, other services, or an OpenAPI description. Keep page data orchestration in React Router loaders and actions,
and use an ordinary resource route for one-off framework endpoints such as OAuth callbacks, redirects, signed webhooks,
or file responses. The package does not generate page loaders, form actions, route middleware, or cache behavior.

## Prerequisites

Install React Router v7 and the adapter alongside the core package:

```sh
npm install @hulla/api @hulla/api-react-router react-router@7
```

First define the shared contract from [contract authoring](./contract-authoring.md), then create the server value mounted
below:

```ts
// app/api/server.ts
import { defineServer } from '@hulla/api/server'
import { contract } from './contract'

export const implementation = defineServer(contract).implement({
  health: ({ response }) => response(200, 'ok'),
  users: {
    byId: ({ params, response }) => response(200, { id: params.id, name: 'Ada' }),
    rename: ({ params, body, response }) => response(200, { id: params.id, name: body.name }),
  },
})
```

See [server authoring](./server-authoring.md) for context, middleware, declared errors, and independently deployable
fragments.

## Contract-backed resource route

Declare one splat route in `app/routes.ts`:

```ts
import { route, type RouteConfig } from '@react-router/dev/routes'

export default [route('api/*', './routes/api.ts')] satisfies RouteConfig
```

Mount the implementation in that route module and export its handlers separately:

```ts
// app/routes/api.ts
import { reactRouterAdapter } from '@hulla/api-react-router'
import { implementation } from '../api/server'

const handlers = reactRouterAdapter().mount(implementation)

export const action = handlers.action
export const loader = handlers.loader
```

Do not add a default component export: that keeps the module a resource route. React Router's Framework Mode compiler
also cannot remove individual route exports from an exported destructuring declaration, so use the two separate
assignments above rather than `export const { action, loader } = handlers`.

React Router calls `loader` for reads and `action` for mutations. The adapter dispatches the native request method and
complete URL against the mounted contract. A `HEAD` request executes the matching `GET` contract route and returns the
same status and headers without a body. The resource route's `action` accepts React Router's supported mutation methods;
an unimplemented method receives the mounted fragment's protocol-safe `404` or `405` response.

The two parameter layers remain separate:

- React Router's `params['*']` identifies the remainder of the host resource route.
- An `@hulla/api` operation handler receives the decoded `params` declared by its contract route.

React Router resource routes cannot expose `@hulla/api`'s `QUERY` method. `mount()` rejects a complete implementation or
fragment containing one instead of leaving the operation unreachable. Keep native `OPTIONS` behavior in surrounding
server middleware when it is needed.

## Native route context

Use `adapter.context()` when server context construction needs React Router's load context or host-route params. Pass
their application-specific types to the adapter:

```ts
import { defineServer } from '@hulla/api/server'
import { reactRouterAdapter } from '@hulla/api-react-router'

type LoadContext = {
  readonly session: { readonly userId: string }
}

type RouteParams = {
  readonly '*': string | undefined
}

const adapter = reactRouterAdapter<LoadContext, RouteParams>()

const server = defineServer(contract, {
  context: adapter.context(({ request, route, reactRouterContext, reactRouterParams }) => ({
    operation: route.key,
    session: reactRouterContext.session,
    splat: reactRouterParams['*'],
    userAgent: request.headers.get('user-agent'),
  })),
})
```

`reactRouterContext` is the `context` supplied to the resource route's loader or action. Its concrete shape follows the
application's React Router server and middleware configuration. `reactRouterParams` is the host route's parameter map,
while `route` remains the matched contract operation metadata.

A factory wrapped with `adapter.context()` is bound to the `react-router` adapter. Mounting its implementation through
generic Fetch, another framework adapter, or the in-process transport fails immediately. Keep the context factory
portable when it needs only contract metadata or request-independent services.

## Errors

Set an error hook on the adapter or override it for one mounted fragment:

```ts
const adapter = reactRouterAdapter<LoadContext, RouteParams>({
  onError({ error, phase, request, route, reactRouterContext, reactRouterParams, defaultResponse }) {
    console.error(phase, request.url, route?.key, reactRouterContext, reactRouterParams, error)
    return defaultResponse
  },
})

const handlers = adapter.mount(implementation)
```

The hook receives `@hulla/api`'s protocol-safe default `Response`, the native request, React Router load context and
params, and matched contract metadata when available. Return a replacement `Response` or `undefined` to retain the
default. Options passed to `mount()` shallowly override adapter defaults.

## Consume the API from page routes

The resource-route adapter does not replace React Router's data APIs. Create the ordinary client and call it from page
loaders or actions so React Router continues to own navigation loading, form submissions, revalidation, pending state,
and error boundaries:

```ts
// app/api/client.ts
import { createClient } from '@hulla/api/client'
import { fetchTransport } from '@hulla/api/fetch'
import { contract } from './contract'

export const api = createClient(contract, {
  transport: fetchTransport({ baseUrl: process.env.API_ORIGIN }),
})
```

```tsx
// app/routes/users.tsx
import type { Route } from './+types/users'
import { api } from '../api/client'

export async function loader({ params }: Route.LoaderArgs) {
  const result = await api.users.byId({ params: { id: params.id } })

  if (result.status !== 200) {
    throw new Response('User not found', { status: result.status })
  }

  return result.body
}

export default function User({ loaderData }: Route.ComponentProps) {
  return <h1>{loaderData.name}</h1>
}
```

Server-side loaders need an absolute API origin and must deliberately forward only the credentials required by the API.
An ordinary server-side Fetch does not inherit the incoming browser request's cookies or authorization headers. If the
data is private to one React Router application and does not need a durable HTTP contract, keep that operation directly
in the page loader or action.

## Split large APIs with fragments

A resource route imports everything in the implementation it mounts. Large contracts can retain code-splitting and
ownership boundaries by mounting independently executable fragments beneath narrower splat routes:

```ts
// app/routes/api-admin.ts
import { reactRouterAdapter } from '@hulla/api-react-router'
import { adminImplementation } from '../api/admin.server'

const handlers = reactRouterAdapter().mount(adminImplementation)

export const action = handlers.action
export const loader = handlers.loader
```

Register that module with `route('api/admin/*', './routes/api-admin.ts')`. React Router remains responsible for host
routing and application data flow; the fragment contains only its selected contract routes and server handlers.
