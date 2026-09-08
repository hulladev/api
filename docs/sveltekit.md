# SvelteKit

For the recommended local/browser setup and enforced module boundaries, see [hybrid rendering](./hybrid-rendering.md). Its examples link to the production-build fixtures used by this integration.

`@hulla/api-sveltekit` mounts an `@hulla/api` server implementation in a SvelteKit `+server.ts` endpoint. SvelteKit owns
file routing, hooks, rendering, form actions, remote functions, and deployment; `@hulla/api` owns the shared HTTP
contract, input decoding, middleware and handler execution, and declared response serialization.

Import endpoint APIs from `@hulla/api-sveltekit/server` and the server-only remote-function transport from
`@hulla/api-sveltekit/remote`. The package intentionally has no mixed root entrypoint because the latter also depends
on SvelteKit's generated `$app/server` module.

Use this adapter for an HTTP boundary shared with generated clients, mobile applications, other services, or an OpenAPI
description. Prefer SvelteKit form actions or remote functions for application-local operations and native endpoints for
one-off concerns such as OAuth callbacks, signed webhooks, redirects, or file handling.

## Prerequisites

Define the shared contract, then implement the server value mounted below:

```ts
// src/lib/api/server.ts
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

See [contract authoring](./contract-authoring.md) and [server authoring](./server-authoring.md) for contracts, context,
middleware, declared errors, and independently deployable fragments.

## Catch-all endpoint

Create a rest-parameter endpoint and export the mounted handler under every HTTP method used by the implementation:

```ts
// src/routes/api/[...api]/+server.ts
import { svelteKitAdapter } from '@hulla/api-sveltekit/server'
import { implementation } from '$lib/api/server'

const handler = svelteKitAdapter().mount(implementation)

export { handler as DELETE, handler as GET, handler as PATCH, handler as POST, handler as PUT }
```

Only export methods the mounted implementation contains. SvelteKit discovers endpoint methods from static named exports,
so the adapter returns one handler rather than a dynamically generated method map. The file route selects the catch-all;
`@hulla/api` then matches the complete request method and URL against the mounted contract fragment.

`[...api]` covers paths below `/api`. If the contract declares an operation exactly at `/api`, re-export the same handler
from `src/routes/api/+server.ts` as well. When a `GET` export exists without `HEAD`, SvelteKit automatically answers `HEAD`
using that handler. The adapter also supports an explicit `HEAD` re-export: it dispatches through the contract's `GET`
route and returns the status and headers without a body.

SvelteKit endpoints cannot expose `@hulla/api`'s `QUERY` method. `mount()` rejects an implementation or fragment containing
one rather than leaving it unreachable. Keep framework-specific `OPTIONS` behavior in the endpoint or a server hook when
it is not part of the shared contract.

## Consume the API from SvelteKit

Use SvelteKit's enhanced `fetch` inside `load` so server rendering inherits credentials, resolves same-origin requests,
and invokes internal endpoints without a network round trip:

```ts
// src/routes/users/[id]/+page.ts
import { defineClient } from '@hulla/api/client'
import { fetchTransport } from '@hulla/api/fetch'
import { contract } from '$lib/api/contract'
import type { PageLoad } from './$types'

export const load: PageLoad = async ({ fetch, params, url }) => {
  const api = defineClient(contract, {
    transport: fetchTransport({ baseUrl: url.origin, fetch }),
  })
  const result = await api.users.byId({ params: { id: params.id } })

  if (result.status !== 200) throw new Error(`Could not load user: ${result.status}`)
  return { user: result.body }
}
```

Keep SvelteKit's form actions and remote functions in charge of progressive enhancement, pending state, invalidation, and
navigation. They can call the same HTTP client when the deployed HTTP boundary itself should be exercised.

## Remote functions

Remote functions require SvelteKit 2.27 or newer and are still experimental. Enable `kit.experimental.remoteFunctions` in
`svelte.config.js` before importing this package's `/remote` entrypoint.

Use the `/remote` entrypoint when a SvelteKit `query`, `form`, or `command` should execute the same contract implementation
without an internal HTTP request. `svelteKitRemoteTransport()` preserves the normal @hulla/api client/server validation and
codec boundary, but dispatches directly inside the current server process:

```ts
// src/routes/users/data.remote.ts
import { defineClient } from '@hulla/api/client'
import { svelteKitRemoteTransport } from '@hulla/api-sveltekit/remote'
import { command, query } from '$app/server'
import { renameUserInput, userId } from '$lib/api/schemas'
import { contract } from '$lib/api/contract'
import { implementation } from '$lib/api/server'

const api = defineClient(contract, {
  transport: svelteKitRemoteTransport(implementation),
})

export const getUser = query(userId, async (id) => {
  const result = await api.users.byId({ params: { id } })
  if (result.status !== 200) throw new Error(`Could not load user: ${result.status}`)
  return result.body
})

export const renameUser = command(renameUserInput, async ({ id, name }) => {
  const result = await api.users.rename({ params: { id }, body: { name } })
  if (result.status !== 200) throw new Error(`Could not rename user: ${result.status}`)
  return result.body
})
```

SvelteKit still owns the remote-function protocol, query deduplication, forms, refreshes, single-flight mutations, live
connections, and `devalue` serialization. @hulla/api owns only the contract call inside the server callback. Share the same
Standard Schema values between the contract and remote declaration where their input shapes match. SvelteKit must validate
the generated remote endpoint argument even though @hulla/api independently validates the contract boundary.

The transport accepts complete implementations and fragments. It does not call global `fetch`, construct Fetch requests,
or route through the catch-all `+server.ts` endpoint. The result remains @hulla/api status-discriminated union, so the remote
callback must deliberately map non-success statuses into a returned value or thrown SvelteKit error.

When the implementation uses `svelteKitAdapter().context(...)`, the remote transport synchronously reads SvelteKit's
current `RequestEvent` and supplies the same `svelteKitEvent` context field used by the endpoint adapter:

```ts
// src/lib/api/server.ts
import { defineServer } from '@hulla/api/server'
import { svelteKitAdapter } from '@hulla/api-sveltekit/server'
import { contract } from './contract'

const adapter = svelteKitAdapter()

export const implementation = defineServer(contract, {
  context: adapter.context(({ route, svelteKitEvent }) => ({
    actor: svelteKitEvent.locals.actor,
    operation: route.key,
  })),
}).implement(/* handlers */)
```

That implementation can be mounted by both `svelteKitAdapter().mount()` and `svelteKitRemoteTransport()`. During a remote
call, `request` and `svelteKitEvent.request` describe SvelteKit's generated remote-function request, while the @hulla/api `route`
describes the contract operation being executed. SvelteKit's page route, params, and URL are client-influenced and must not
be used for authorization; authenticated identity should come from trusted locals or cookies.

SvelteKit does not expose `getRequestEvent()` to `prerender` callbacks. A remote `prerender` function can therefore use the
transport only with a context-free implementation or fragment. `query.live` can call the same client, but connection and
iterator lifecycle remain entirely SvelteKit concerns.

## Native request-event context

Use `adapter.context()` when context construction needs SvelteKit request state:

```ts
import { defineServer } from '@hulla/api/server'
import { svelteKitAdapter } from '@hulla/api-sveltekit/server'

const adapter = svelteKitAdapter()

const server = defineServer(contract, {
  context: adapter.context(({ request, route, svelteKitEvent }) => ({
    actor: svelteKitEvent.locals.actor,
    clientAddress: svelteKitEvent.getClientAddress(),
    operation: route.key,
    platform: svelteKitEvent.platform,
    request,
  })),
})
```

`svelteKitEvent` is SvelteKit's complete `RequestEvent`, including `cookies`, enhanced `fetch`, `locals`, file-route
`params`, `platform`, route ID, URL, and response-header helpers. `request` is also exposed directly for consistency with
the other Fetch-based adapters. The `route` value is contract-derived operation metadata and is separate from
`svelteKitEvent.route` and `svelteKitEvent.params`, which describe the host file route.

Type locals through SvelteKit's standard application augmentation:

```ts
// src/app.d.ts
declare global {
  namespace App {
    // Interface declaration is required here because SvelteKit uses declaration merging.
    interface Locals {
      actor: { readonly userId: string }
    }
  }
}

export {}
```

A server `handle` hook should authenticate the request and populate `event.locals`. The `@hulla/api` context can then
translate framework state into the smaller application context used by contract handlers. A context factory wrapped by
`adapter.context()` is bound to `sveltekit`; mounting it through another adapter or the generic in-process transport fails
early. The SvelteKit remote transport deliberately satisfies that same adapter requirement.

## Errors

Set a shared error hook on the adapter, or override it for one mounted fragment:

```ts
const adapter = svelteKitAdapter({
  onError({ error, phase, request, route, svelteKitEvent, defaultResponse }) {
    console.error(phase, request.url, route?.key, svelteKitEvent.route.id, error)
    return defaultResponse
  },
})

const handler = adapter.mount(implementation)
```

The hook receives `@hulla/api`'s protocol-safe default `Response`, the original SvelteKit event, the request, and matched
contract metadata when available. Return a replacement `Response` or `undefined` to retain the default. Options passed to
`mount()` shallowly override adapter defaults.

## Split large APIs with fragments

A catch-all endpoint imports everything in the implementation it mounts. Large APIs can preserve code-splitting and
ownership boundaries by mounting independently executable fragments below narrower file routes:

```ts
// src/routes/api/admin/[...api]/+server.ts
import { svelteKitAdapter } from '@hulla/api-sveltekit/server'
import { adminImplementation } from '$lib/api/admin.server'

const handler = svelteKitAdapter().mount(adminImplementation)

export { handler as DELETE, handler as GET, handler as PATCH, handler as POST }
```

Keep SvelteKit's application data flow native: `load` orchestrates page data, remote functions own their caching, forms,
mutations, and refresh lifecycle, and server hooks own framework-wide concerns. `@hulla/api` supplies a durable HTTP
contract where external consumers need one and a zero-hop reuse path inside native remote callbacks.
