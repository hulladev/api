# SolidStart

Serve your API from a SolidStart v2 API route, then call it with browser Fetch or a Solid Router query or action.

The API route makes the contract available to other apps over HTTP. If an operation is used only by your SolidStart UI, you can use a server-only query with a [local client](https://hulla.dev/docs/api/transports/in-process) instead.

## Install the integration

Start with an existing SolidStart v2 application whose `vite.config.ts` already runs with the SolidStart Vite plugin. SolidStart v2 requires Node.js 24 or newer and [Vite 8 or 9](https://docs.solidjs.com/solid-start/v2/reference/entrypoints/vite-config); production deployment configuration remains application-owned.

<!-- docs:package-manager -->
```sh
# Bun
bun add @hulla/api @hulla/api-solid-start zod

# npm
npm install @hulla/api @hulla/api-solid-start zod

# pnpm
pnpm add @hulla/api @hulla/api-solid-start zod

# Yarn
yarn add @hulla/api @hulla/api-solid-start zod
```

The adapter's peer dependency is `@solidjs/start` `^2.0.0`. It does not support the Vinxi event shape from SolidStart v1.

## Define the contract and implementation

Keep the contract in shared code. This example declares `GET /api/health` and `POST /api/users`:

```ts
// src/api/contract.ts
import { defineContract, response, route, router } from '@hulla/api'
import { z } from 'zod'

const user = z.object({
  id: z.string(),
  name: z.string(),
})

export const contract = defineContract({
  basePath: '/api',
  routes: {
    health: route.get('/health', {
      responses: { 200: response.json(z.literal('ok')) },
    }),
    users: router('/users', {
      routes: {
        create: route.post('/', {
          body: z.object({ name: z.string().min(1) }),
          responses: { 201: response.json(user) },
        }),
      },
    }),
  },
})
```

Implement the same route tree in server code:

```ts
// src/api/server.ts
import { defineServer } from '@hulla/api/server'
import { contract } from './contract'

export const implementation = defineServer(contract).implement({
  health: ({ response }) => response(200, 'ok'),
  users: {
    create: ({ body, response }) =>
      response(201, { id: 'user-1', name: body.name }),
  },
})
```

The contract's `basePath` is `/api`, so the catch-all route must pass requests below `/api` to the adapter. See [contract authoring](./contract-authoring.md) and [server implementations](./server-authoring.md) for the complete APIs.

## Mount the catch-all API route

Create a catch-all file route and export the mounted handler only under the methods declared by the sample contract:

```ts
// src/routes/api/[...api].ts
import { solidStartAdapter } from '@hulla/api-solid-start'
import { implementation } from '~/api/server'

const handler = solidStartAdapter().mount(implementation)

export { handler as GET, handler as POST }
```

SolidStart discovers API methods from static named exports, so `mount()` returns one handler rather than a dynamically generated method map. The host catch-all chooses the file route; `@hulla/api` then matches the complete request method and URL against the mounted contract.

> Export only the methods present in the mounted implementation. Static method exports are part of SolidStart's route contract; do not export every HTTP method merely because the handler can reject unsupported requests.

The `[...api].ts` route covers paths below `/api`. If the contract also declares an operation exactly at `/api`, export the same handler methods from `src/routes/api/index.ts`.

When an API route exports `GET` but not `HEAD`, SolidStart calls the `GET` handler for `HEAD` requests. The adapter dispatches that request through the contract's `GET` route and removes the response body. During native context construction, the direct `request` has method `GET`, while `solidStartEvent.request` retains the incoming `HEAD` method.

SolidStart API routes cannot expose `@hulla/api`'s `QUERY` method. `mount()` rejects an implementation or fragment containing one. Keep `OPTIONS` behavior in the route or surrounding middleware when the application needs custom CORS handling.

## Verify the HTTP boundary

Start the application with its normal development command. The port may differ in your project; the examples use `http://localhost:3000`.

```sh
curl -i http://localhost:3000/api/health
```

The route returns the declared response:

```http
HTTP/1.1 200 OK
content-type: application/json

"ok"
```

```sh
curl -i \
  -X POST \
  -H 'content-type: application/json' \
  -d '{"name":"Ada"}' \
  http://localhost:3000/api/users
```

The route returns the declared `201` variant:

```http
HTTP/1.1 201 Created
content-type: application/json

{"id":"user-1","name":"Ada"}
```

## Choose a caller

| Caller | Use | Owner of data flow |
| --- | --- | --- |
| Browser or external service | `fetchTransport()` against the mounted route | HTTP route and caller |
| SolidStart UI read | Solid Router `query()` + `createAsync()` | Solid Router query cache and revalidation |
| SolidStart UI mutation | Solid Router `action()` and a form | Solid Router submission and revalidation |
| Application-local server code | Server-only query/function + `inProcessTransport()` | The current server process |

For a complete transport decision, see [server and browser calls](./hybrid-rendering.md).

### Browser and external HTTP calls

Create a browser-safe client when the HTTP route itself is the boundary:

```ts
// src/api/client.ts
import { createClient } from '@hulla/api/client'
import { fetchTransport } from '@hulla/api/fetch'
import { contract } from './contract'

export const api = createClient(contract, {
  transport: fetchTransport(),
})
```

An isomorphic HTTP query needs an absolute public origin during SSR because the server's `Request` constructor cannot resolve a relative URL. A server-side HTTP call also does not inherit browser cookies or authorization headers; forward only the credentials the API requires. Configure an absolute `baseUrl` and the required CORS policy for an API on another origin.

### Solid Router query and action

Solid Router's `query()` and `createAsync()` own read caching, preload, and revalidation. Its `action()` owns form submission and pending/error state. Keep this page focused on the boundary; use SolidStart's [data fetching](https://docs.solidjs.com/solid-start/v2/building-your-application/data-fetching) and [data mutation](https://docs.solidjs.com/solid-start/v2/building-your-application/data-mutation) guides for deeper cache and invalidation behavior.

```ts
// src/api/local.ts
import 'server-only'

import { createClient } from '@hulla/api/client'
import { inProcessTransport } from '@hulla/api/in-process'
import { contract } from './contract'
import { implementation } from './server'

export const api = createClient(contract, {
  transport: inProcessTransport(implementation),
})
```

```ts
// src/api/health.ts
import { query } from '@solidjs/router'

export const getHealth = query(async () => {
  'use server'

  const { api } = await import('./local')
  const result = await api.health()

  if (result.status !== 200) throw new Error('Health check failed')
  return result.body
}, 'health')
```

```tsx
// src/routes/index.tsx
import { createAsync } from '@solidjs/router'
import { getHealth } from '../api/health'

export default function Home() {
  const health = createAsync(() => getHealth())
  return <main>API status: {health()}</main>
}
```

For a form mutation, keep the same server-only import boundary:

```tsx
// src/api/users.ts
import { action, useSubmission } from '@solidjs/router'
import { Show } from 'solid-js'

export const createUser = action(async (formData: FormData) => {
  'use server'

  const { api } = await import('./local')
  const result = await api.users.create({
    body: { name: String(formData.get('name') ?? '') },
  })

  if (result.status !== 201) throw new Error('User creation failed')
  return result.body
}, 'createUser')

export function CreateUserForm() {
  const submission = useSubmission(createUser)

  return (
    <form action={createUser} method="post">
      <input name="name" />
      <button disabled={submission.pending}>
        {submission.pending ? 'Creating…' : 'Create user'}
      </button>
      <Show when={submission.error}>
        {(error) => <p>{error().message}</p>}
      </Show>
    </form>
  )
}
```

The `'use server'` directive makes the query or action a SolidStart server function. Its dynamic import keeps the in-process client and implementation behind that server boundary. The in-process transport avoids a loopback HTTP request and does not enter the mounted API route or run SolidStart API-route middleware; it still runs the `@hulla/api` context, middleware, handler, and response pipeline. Use `fetchTransport()` when the native HTTP boundary is part of the behavior you need.

## Use native API-event context

Use `adapter.context()` when contract handlers need SolidStart request state. The adapter exposes the native `APIEvent` alongside the matched contract route:

```ts
// src/api/server-with-context.ts
import { defineServer } from '@hulla/api/server'
import { solidStartAdapter } from '@hulla/api-solid-start'
import { contract } from './contract'

declare global {
  namespace App {
    interface RequestEventLocals {
      actor: { readonly userId: string }
    }
  }
}

const adapter = solidStartAdapter()

export const server = defineServer(contract, {
  context: adapter.context(({ request, route, solidStartEvent }) => ({
    actor: solidStartEvent.locals.actor,
    clientAddress: solidStartEvent.clientAddress,
    nativeEvent: solidStartEvent.nativeEvent,
    operation: route.key,
    request,
  })),
})
```

`solidStartEvent` contains the native `APIEvent`: request-scoped `locals`, file-route `params`, mutable response metadata, optional `clientAddress`, and the underlying H3 event. `request` is also exposed directly, while `route` remains contract-derived operation metadata. SolidStart middleware should authenticate the request and populate `event.locals` before the adapter constructs contract context.

Context created with `adapter.context()` is bound to `solid-start`; another adapter or `inProcessTransport()` cannot supply its native event and rejects the implementation.

## Handle adapter errors

Use `onError` for SolidStart-aware logging or to replace `@hulla/api`'s protocol-safe default response:

```ts
// src/routes/api/[...api].ts
import { solidStartAdapter } from '@hulla/api-solid-start'
import { implementation } from '~/api/server'

const adapter = solidStartAdapter({
  onError({ error, phase, request, route, solidStartEvent, defaultResponse }) {
    console.error(phase, request.url, route?.key, solidStartEvent.clientAddress, error)
    return defaultResponse
  },
})

const handler = adapter.mount(implementation)

export { handler as GET, handler as POST }
```

The hook receives the native event, request, matched contract metadata when available, error phase, and protocol-safe default `Response`. Return a replacement `Response` to customize the result, or `undefined` to keep the default. Model expected application failures as declared contract responses; use this hook for adapter or handler failures.

## Keep fragments for real host boundaries

Use an implementation fragment when a route group needs separate code-splitting, middleware, deployment, or ownership boundaries. Mount that fragment from a narrower catch-all file and export only the methods declared by the fragment. See [fragments and composition](./server-composition.md) for the complete `defineServer(contract.routes...)` patterns.

Keep raw SolidStart API routes for endpoints that benefit more from SolidStart's native `Request`/`Response` and event APIs than from a shared contract. For request-wide authentication and logging, use [SolidStart middleware](https://docs.solidjs.com/solid-start/v2/reference/config/solid-start) and translate its locals through the adapter context above.

Next, read [server and browser calls](./hybrid-rendering.md) to choose a transport, [context and middleware](./server-context.md) for shared contract policy, and [errors](./errors.md) for declared application failures.
