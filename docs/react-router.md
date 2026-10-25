# React Router v7

Add your API to a React Router v7 Framework Mode app with `@hulla/api-react-router`. The adapter creates `loader` and `action` exports for a resource route, so clients can send HTTP requests to it.

If only your own pages need the data, a page loader or action can [call the implementation directly](https://hulla.dev/docs/api/transports/in-process). Expose a resource route when other apps need to call it too.

## Install the integration

Start with an existing React Router v7 Framework Mode application. Its Vite plugin, server adapter, and `app/routes.ts` setup should already work before adding the API packages.

<!-- docs:package-manager -->
```sh
# Bun
bun add @hulla/api @hulla/api-react-router zod

# npm
npm install @hulla/api @hulla/api-react-router zod

# pnpm
pnpm add @hulla/api @hulla/api-react-router zod

# Yarn
yarn add @hulla/api @hulla/api-react-router zod
```

This guide adds one read and one mutation beneath `/api`.

## Define the API

Keep the contract in shared code so server code and HTTP clients use the same paths and response variants:

```ts
// app/api/contract.ts
import { defineContract, request, response, route, router } from '@hulla/api'
import { z } from 'zod'

const user = z.object({ id: z.string(), name: z.string() })

export const contract = defineContract({
  basePath: '/api',
  routes: {
    health: route.get('/health', {
      responses: {
        200: response.json(z.object({ status: z.literal('ok') })),
      },
    }),
    users: router('/users', {
      routes: {
        create: route.post('/', {
          body: request.json(z.object({ name: z.string().min(1) })),
          responses: { 201: response.json(user) },
        }),
      },
    }),
  },
})
```

Implement the same route tree in server code:

```ts
// app/api/server.ts
import { defineServer } from '@hulla/api/server'
import { contract } from './contract'

export const implementation = defineServer(contract).implement({
  health: ({ response }) => response(200, { status: 'ok' }),
  users: {
    create: ({ body, response }) =>
      response(201, { id: 'user-1', name: body.name }),
  },
})
```

The `basePath` is part of each compiled contract path. The host route in the next step must therefore pass `/api/health` and `/api/users` to the adapter without removing `/api`.

See [contracts](./contract-authoring.md) and [server implementations](./server-authoring.md) for the complete authoring APIs.

## Mount a resource route

Register the application page and one splat API route in `app/routes.ts`:

```ts
// app/routes.ts
import { index, route, type RouteConfig } from '@react-router/dev/routes'

export default [
  index('./routes/home.tsx'),
  route('api/*', './routes/api.ts'),
] satisfies RouteConfig
```

Mount the implementation from the API route module:

```ts
// app/routes/api.ts
import { reactRouterAdapter } from '@hulla/api-react-router'
import { implementation } from '../api/server'

const handlers = reactRouterAdapter().mount(implementation)

export const loader = handlers.loader
export const action = handlers.action
```

> A route module with a `loader` or `action` and no default component export is a React Router resource route. Keep the named exports in the direct form shown above so Framework Mode can discover them.

React Router first matches `api/*`; `@hulla/api` then matches the native request method and complete URL against the mounted contract. The two parameter layers serve different purposes:

- `params['*']` is the remainder captured by React Router's host route.
- A contract handler receives only the decoded parameters declared by its contract route.

## Verify both request paths

Start the application with its normal development command. A default React Router Framework Mode application is available at `http://localhost:5173`.

Call the read route:

```sh
curl -i http://localhost:5173/api/health
```

The resource-route `loader` returns the declared response:

```http
HTTP/1.1 200
content-type: application/json

{"status":"ok"}
```

Call the mutation route:

```sh
curl -i \
  -X POST \
  -H 'content-type: application/json' \
  -d '{"name":"Ada"}' \
  http://localhost:5173/api/users
```

The resource-route `action` returns the declared `201` variant:

```http
HTTP/1.1 201
content-type: application/json

{"id":"user-1","name":"Ada"}
```

The adapter maps resource-route methods as follows:

| Incoming request | Resource export | Contract behavior |
| --- | --- | --- |
| `GET` | `loader` | Dispatches the matching `GET` route |
| `HEAD` | `loader` | Dispatches with `GET` semantics, then removes the response body |
| `POST`, `PUT`, `PATCH`, or `DELETE` | `action` | Dispatches the native method unchanged |
| `QUERY` contract route | None | `mount()` rejects the implementation or fragment during setup |

React Router's resource-route method support does not include `QUERY`. Handle `OPTIONS` in the surrounding server or deployment middleware when the application needs custom CORS behavior.

## Call a colocated implementation from a page loader

The mounted resource route is the public HTTP boundary. A server-side page loader in the same application can avoid calling that boundary over HTTP.

Create an in-process client in a `.server.ts` module so the implementation cannot enter a browser bundle:

```ts
// app/api/client.server.ts
import { createClient } from '@hulla/api/client'
import { inProcessTransport } from '@hulla/api/in-process'
import { contract } from './contract'
import { implementation } from './server'

export const api = createClient(contract, {
  transport: inProcessTransport(implementation),
})
```

Call it from the index route registered above:

```tsx
// app/routes/home.tsx
import type { Route } from './+types/home'
import { api } from '../api/client.server'

export async function loader() {
  const result = await api.health()

  if (result.status !== 200) {
    throw new Response('Health check failed', { status: result.status })
  }

  return result.body
}

export default function Home({ loaderData }: Route.ComponentProps) {
  return <p>API status: {loaderData.status}</p>
}
```

In an SSR application, React Router runs this loader on the server and serializes its result to the route component. The in-process transport still applies contract request and response processing, but it does not enter the resource route, run route middleware, or create an HTTP request.

Use the boundary that owns the behavior you need:

| Caller or workflow | Use |
| --- | --- |
| External client or browser code that needs the API endpoint | A `fetchTransport()` client calling the resource route |
| Server loader and portable implementation in the same process | `inProcessTransport(implementation)` |
| UI mutation that should trigger React Router revalidation | A page action, or `<Form>`/`useFetcher()` targeting an action |
| Plain browser `fetch()` mutation | The API client plus explicit UI refresh or revalidation |

A plain `fetch()` to the resource route does not automatically revalidate matched UI loaders. Submissions through React Router's `<Form>` or `useFetcher()` participate in its action and revalidation lifecycle.

Read [server and browser calls](./hybrid-rendering.md) for the full transport decision.

## Use native React Router context

Use `adapter.context()` when contract handlers need the native request, load context, or host-route parameters:

```ts
// app/api/server.ts
import { defineServer } from '@hulla/api/server'
import { reactRouterAdapter } from '@hulla/api-react-router'
import { contract } from './contract'

type LoadContext = {
  readonly session: { readonly userId: string }
}

type RouteParams = {
  readonly '*': string | undefined
}

export const adapter = reactRouterAdapter<LoadContext, RouteParams>()

export const server = defineServer(contract, {
  context: adapter.context(
    ({ request, route, reactRouterContext, reactRouterParams }) => ({
      userId: reactRouterContext.session.userId,
      userAgent: request.headers.get('user-agent'),
      operation: route.key,
      splat: reactRouterParams['*'],
    })
  ),
})
```

`reactRouterContext` is the context supplied to the resource route's loader or action. Its concrete type depends on the application's server and middleware configuration. `reactRouterParams` contains host-route parameters; `route` describes the matched contract operation.

An implementation created from this server is bound to the React Router adapter. `inProcessTransport()` and other adapters reject it because they cannot supply the native context. Keep context portable if the same implementation must support the local page-loader path shown above.

## Handle adapter failures

Use `onError` for native logging or to replace `@hulla/api`'s protocol-safe default response:

```ts
const adapter = reactRouterAdapter<LoadContext, RouteParams>({
  onError({ error, phase, request, route, defaultResponse }) {
    console.error(phase, request.url, route?.key, error)
    return defaultResponse
  },
})
```

Returning `undefined` keeps `defaultResponse`; returning a `Response` replaces it. Declared `4xx` and `5xx` contract results are normal responses and do not invoke this hook.

React Router treats a returned resource-route `Response`, including one with a `4xx` or `5xx` status, as a completed request rather than a thrown route error. If a page should render its `ErrorBoundary`, narrow the API result in that page's loader or action and throw there.

## Mount fragments only for real host boundaries

`mount()` also accepts an independently executable server fragment. Register a narrower splat route when part of the API needs a separate route module, middleware scope, or server bundle:

```ts
// app/routes/api-admin.ts
import { reactRouterAdapter } from '@hulla/api-react-router'
import { adminImplementation } from '../api/admin.server'

const handlers = reactRouterAdapter().mount(adminImplementation)

export const loader = handlers.loader
export const action = handlers.action
```

Map the module with `route('api/admin/*', './routes/api-admin.ts')`, and ensure the fragment's contract paths include the same `/api/admin` prefix received by the adapter. Do not split fragments merely to make the handler tree shorter; use [server fragments and composition](./server-composition.md) for code organization inside one host boundary.

## Next steps

- Read [server context and middleware](./server-context.md) when handlers need shared request policy.
- Read [errors](./errors.md) to model declared application failures separately from adapter failures.
- Read [server and browser calls](./hybrid-rendering.md) before adding browser clients or a separately deployed API.
