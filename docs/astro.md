# Astro

`@hulla/api-astro` mounts an `@hulla/api` implementation in an Astro endpoint and can call the same implementation
without HTTP from an Astro component or server island. Astro continues to own file routing, rendering, middleware,
actions, islands, and deployment; Hulla owns the shared HTTP contract, validation, middleware, handler execution, and
declared responses.

This is an API integration, not an Astro deployment adapter. An on-demand endpoint or server island still requires an
Astro server output mode and a deployment adapter such as `@astrojs/node`, `@astrojs/cloudflare`, or the adapter for your
host.

Use a contract-backed endpoint when browsers, mobile clients, other services, or generated OpenAPI clients need the
same HTTP boundary. Prefer Astro Actions for application-local mutations and native endpoints for one-off concerns such
as redirects, OAuth callbacks, signed webhooks, and file responses.

## Catch-all API endpoint

Mount a complete implementation or independently executable fragment in an Astro rest-parameter endpoint:

```ts
// src/pages/api/[...api].ts
import { astroAdapter } from '@hulla/api-astro'
import { implementation } from '../../api/server'

export const prerender = false
export const ALL = astroAdapter().mount(implementation)
```

Astro selects the `/api/[...api]` host route and passes its native `APIContext`; Hulla then matches the complete request
method and URL against the mounted contract. `ALL` lets the same handler expose every method in the fragment, including
the custom `QUERY` method. An incoming `HEAD` request dispatches through the contract's `GET` operation and returns its
status and headers without a body, matching Astro's endpoint behavior.

`[...api]` covers paths below `/api`. If the contract also declares an operation exactly at `/api`, re-export the same
handler from `src/pages/api.ts`. Keep the API namespace separate from Astro's reserved `/_server-islands` route.

With `output: 'static'`, `prerender = false` opts this endpoint into on-demand rendering. With `output: 'server'`, the
endpoint is on-demand by default. Both configurations need a deployment adapter.

## Native Astro context

Use `adapter.context()` when context construction needs locals, cookies, route parameters, or another value from Astro's
`APIContext`:

```ts
// src/api/server.ts
import { astroAdapter } from '@hulla/api-astro'
import { defineServer } from '@hulla/api/server'
import { contract } from './contract'

export const adapter = astroAdapter()

export const implementation = defineServer(contract, {
  context: adapter.context(({ astroContext, request, route }) => ({
    actor: astroContext.locals.actor,
    session: astroContext.cookies.get('session')?.value,
    operation: route.key,
    userAgent: request.headers.get('user-agent'),
  })),
}).implement(/* handlers */)
```

`astroContext` is Astro's complete native `APIContext`. The separate `request` field is the request being dispatched,
and `route` is Hulla's matched contract operation rather than Astro's catch-all file route. Define `App.Locals` in
`src/env.d.ts` and populate it in Astro middleware as usual.

A context factory wrapped by `adapter.context()` is bound to the Astro adapter. Mounting it through a different adapter
or the generic in-process transport fails early.

## Calling from Astro components

For a public HTTP request, use the ordinary Fetch client. Browser calls may use a relative base URL. Server-rendered
components must provide an absolute origin, and a server-side `fetch` does not automatically inherit the incoming
request's cookies or headers.

When the implementation is colocated in the same Astro server, `astroInProcessTransport()` avoids the internal HTTP
round trip while preserving the normal client/server validation and codec boundary:

```astro
---
import { astroInProcessTransport } from '@hulla/api-astro'
import { defineClient } from '@hulla/api/client'
import { contract } from '../api/contract'
import { implementation } from '../api/server'

const api = defineClient(contract, {
  transport: astroInProcessTransport(implementation, Astro),
}).create()

const result = await api.users.byId({ params: { id: Astro.params.id! } })
if (result.status !== 200) throw new Error(`Could not load user: ${result.status}`)
---

<h1>{result.body.name}</h1>
```

The explicit `Astro` argument keeps context request-scoped and makes the same transport safe for ordinary SSR and
deferred server islands. It accepts complete implementations and fragments and does not call global `fetch` or route
through the catch-all endpoint.

## Server islands

No additional adapter layer is needed for `server:defer`. Astro serializes the component props, renders the fallback,
fetches its internal island endpoint, and swaps in the returned HTML. The island can use the same zero-hop client:

```astro
---
// src/components/UserCard.astro
import { astroInProcessTransport } from '@hulla/api-astro'
import { defineClient } from '@hulla/api/client'
import { contract } from '../api/contract'
import { implementation } from '../api/server'

const { id } = Astro.props
const api = defineClient(contract, {
  transport: astroInProcessTransport(implementation, Astro),
}).create()
const result = await api.users.byId({ params: { id } })
---

{result.status === 200 ? <article>{result.body.name}</article> : <p>Unavailable</p>}
```

```astro
---
import UserCard from '../components/UserCard.astro'
---

<UserCard id="user-1" server:defer>
  <p slot="fallback">Loading…</p>
</UserCard>
```

Inside the deferred component, `Astro.request` describes Astro's internal `/_server-islands/...` request, not the page
that contains the component. Accordingly, Hulla context sees that internal native request while its `route` metadata
still describes the contract operation. Pass page-derived values to the island as serializable props. Derive identity
and authorization from trusted cookies or middleware-populated locals, not from an assumed containing-page URL.

Astro owns the island protocol, encrypted props, fallback, request, rendering, and swap. The Hulla transport only
executes the selected contract operation inside that server render; it does not replace or intercept Astro's island
fetch.

## Errors and fragments

Set an error hook on the adapter, or override it for one mount:

```ts
const adapter = astroAdapter({
  onError({ error, phase, request, route, astroContext, defaultResponse }) {
    console.error(phase, request.url, route?.key, astroContext.url.pathname, error)
    return defaultResponse
  },
})
```

The hook may return a replacement `Response` or `undefined` to retain Hulla's protocol-safe default. Large APIs can mount
independently executable fragments below narrower Astro rest routes so unrelated handlers do not enter one server chunk.

Astro Actions and server islands should remain framework-native. Use this package where a durable HTTP contract or
validated reuse of the same implementation is valuable; it deliberately adds no action, caching, rendering, or
hydration abstraction.
