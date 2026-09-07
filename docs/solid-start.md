# SolidStart

`@hulla/api-solid-start` mounts an `@hulla/api` server implementation in a SolidStart v2 API route. SolidStart owns file
routing, request middleware, rendering, server functions, and deployment; `@hulla/api` owns the shared HTTP contract, input
decoding, middleware and handler execution, and declared response serialization.

Use this adapter for an HTTP boundary shared with generated clients, mobile applications, other services, or an OpenAPI
description. Prefer SolidStart server functions for application-local RPC and native API routes for one-off endpoints
such as OAuth callbacks, signed webhooks, redirects, or file handling. The package does not wrap loaders, actions,
server functions, middleware, or Nitro.

SolidStart v2 requires Node.js 24 or newer and Vite 8. The adapter follows that runtime floor and does not support the
Vinxi event shape from SolidStart v1.

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

## Catch-all API route

Create a catch-all route and export the mounted handler under every HTTP method used by the implementation:

```ts
// src/routes/api/[...api].ts
import { solidStartAdapter } from '@hulla/api-solid-start'
import { implementation } from '~/api/server'

const handler = solidStartAdapter().mount(implementation)

export { handler as DELETE, handler as GET, handler as PATCH, handler as POST, handler as PUT }
```

Only export methods the mounted implementation actually contains. SolidStart discovers API methods from static named
exports, so the adapter returns one handler rather than a dynamically generated method map. The host catch-all chooses
the route file; `@hulla/api` then matches the complete request method and URL against the mounted contract fragment.

`[...api].ts` covers paths below `/api`. If the contract declares an operation exactly at `/api`, re-export the same
handler from `src/routes/api/index.ts` as well. SolidStart maps `GET` exports to `HEAD` when there is no explicit `HEAD`
export. The adapter dispatches that synthesized request through the contract's `GET` route and returns its status and
headers without a body. During that request, the direct `@hulla/api` `request` has method `GET`, while
`solidStartEvent.request` retains the native `HEAD` method.

SolidStart API routes cannot expose `@hulla/api`'s `QUERY` method. `mount()` rejects a complete implementation or fragment
containing one rather than leaving it unreachable. Native `OPTIONS` handling can remain in the route file or surrounding
deployment middleware.

## Consume the API from Solid

The server adapter does not replace Solid's data primitives. Create the ordinary typed `@hulla/api` client, then use its route
calls as the fetchers inside the application's data layer. The examples below use the official Solid Router; a
SolidStart application configured with TanStack Solid Router should keep using its loaders and query APIs around the
same client.

```ts
// src/api/client.ts
import { defineClient } from '@hulla/api/client'
import { fetchTransport } from '@hulla/api/fetch'
import { contract } from './contract'

const baseUrl: string | undefined = import.meta.env.VITE_API_ORIGIN

if (import.meta.env.SSR && (!baseUrl || !URL.canParse(baseUrl))) {
  throw new Error('VITE_API_ORIGIN must be an absolute URL during SSR')
}

export const api = defineClient(contract, {
  transport: fetchTransport({ baseUrl }),
})
```

An omitted `baseUrl` produces same-origin relative requests in the browser. A Solid Router query can also execute during
server rendering, where the native `Request` constructor requires an absolute URL, so configure the application's public
origin when SSR is enabled. If the API is on another origin, configure its origin instead and set the required CORS and
credential policy there.

Wrap reads with Solid Router's `query()` and consume them with `createAsync()`. This retains SolidStart's request-scoped
SSR cache, hydration, navigation preload, and revalidation behavior while `@hulla/api` retains input and response typing:

```tsx
// src/routes/users/[id].tsx
import { createAsync, query, type RouteDefinition } from '@solidjs/router'
import { Show } from 'solid-js'
import { api } from '~/api/client'

const getUser = query(async (id: string) => {
  const result = await api.users.byId({ params: { id } })

  if (result.status !== 200) {
    throw new Error(`Could not load user: ${result.status}`)
  }

  return result.body
}, 'user')

export const route = {
  preload: ({ params }) => getUser(params.id),
} satisfies RouteDefinition

export default function UserPage(props: { params: { id: string } }) {
  const user = createAsync(() => getUser(props.params.id))

  return <Show when={user()}>{(value) => <h1>{value().name}</h1>}</Show>
}
```

Use an `action()` for writes so forms, pending and error state, progressive enhancement, and query revalidation remain
Solid Router concerns:

```tsx
import { action, useSubmission } from '@solidjs/router'
import { Show } from 'solid-js'
import { api } from '~/api/client'

const renameUser = action(async (id: string, formData: FormData) => {
  const result = await api.users.rename({
    params: { id },
    body: { name: String(formData.get('name') ?? '') },
  })

  if (result.status !== 200) {
    throw new Error(`Could not rename user: ${result.status}`)
  }

  return result.body
}, 'renameUser')

export default function RenameUser(props: { params: { id: string } }) {
  const submission = useSubmission(renameUser)

  return (
    <form action={renameUser.with(props.params.id)} method="post">
      <input name="name" />
      <button disabled={submission.pending}>{submission.pending ? 'Saving…' : 'Save'}</button>
      <Show when={submission.error}>{(error) => <p>{error().message}</p>}</Show>
    </form>
  )
}
```

A successful action revalidates active page queries by default. Use the query's `key` or `keyFor()` with Solid Router's
revalidation APIs when a mutation needs narrower invalidation.

Browser requests automatically follow Fetch's same-origin credential behavior. A server-side HTTP call does not inherit
the incoming browser request's cookies or authorization headers; authenticated SSR must deliberately forward only the
required credentials. If the data is private to this SolidStart UI and does not need the HTTP contract, keep it in a
server-only query or server function instead of adding an extra HTTP hop.

## Native API event context

Use `adapter.context()` when context construction needs SolidStart request state:

```ts
import { defineServer } from '@hulla/api/server'
import { solidStartAdapter } from '@hulla/api-solid-start'

const adapter = solidStartAdapter()

const server = defineServer(contract, {
  context: adapter.context(({ request, route, solidStartEvent }) => ({
    actor: solidStartEvent.locals.actor,
    clientAddress: solidStartEvent.clientAddress,
    h3Event: solidStartEvent.nativeEvent,
    operation: route.key,
    request,
  })),
})
```

`solidStartEvent` is SolidStart's complete `APIEvent`: `request`, file-route `params`, mutable response metadata,
request `locals`, optional `clientAddress`, and the native H3 event remain available. `request` is also exposed directly
for consistency with the other `@hulla/api` Fetch-based adapters. The `route` value remains contract-derived operation
metadata; it is separate from `solidStartEvent.params`, which describes the host file route.

Type request locals through SolidStart's standard application augmentation:

```ts
declare global {
  namespace App {
    // Interface declaration is required here because SolidStart uses declaration merging.
    interface RequestEventLocals {
      actor: { readonly userId: string }
    }
  }
}
```

SolidStart middleware should authenticate the request and populate `event.locals`. The `@hulla/api` context can then translate
that framework state into the smaller application context used by contract handlers. A context factory wrapped with
`adapter.context()` is bound to `solid-start`; mounting it through another adapter or the in-process transport fails
immediately.

## Errors

Set a shared error hook on the adapter, or override it for one mounted fragment:

```ts
const adapter = solidStartAdapter({
  onError({ error, phase, request, route, solidStartEvent, defaultResponse }) {
    console.error(phase, request.url, route?.key, solidStartEvent.clientAddress, error)
    return defaultResponse
  },
})

const handler = adapter.mount(implementation)
```

The hook receives `@hulla/api`'s protocol-safe default `Response`, the original SolidStart event, the request, and matched
contract metadata when available. Return a replacement `Response` or `undefined` to retain the default. Options passed
to `mount()` shallowly override adapter defaults.

## Split large APIs with fragments

A catch-all route imports everything in the implementation it mounts. Large APIs can preserve code-splitting and
ownership boundaries by creating independently executable fragments and mounting each one below a narrower file route:

```ts
// src/routes/api/admin/[...api].ts
import { solidStartAdapter } from '@hulla/api-solid-start'
import { adminImplementation } from '~/api/admin.server'

const handler = solidStartAdapter().mount(adminImplementation)

export { handler as DELETE, handler as GET, handler as PATCH, handler as POST }
```

Keep SolidStart's application data flow native: route loaders orchestrate navigation, server functions handle colocated
RPC, and request middleware owns framework-wide concerns. `@hulla/api` should remain the owner only where a durable HTTP
contract is useful.
