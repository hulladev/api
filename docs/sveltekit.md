# SvelteKit

Serve your API from a SvelteKit `+server.ts` endpoint. We'll make an HTTP request to check it, then call it from a page's `load` function.

Import endpoint helpers from `@hulla/api-sveltekit/server`. For operations used only by your SvelteKit app, you can also use [remote functions](./sveltekit-remote-functions.md); their helpers live in `@hulla/api-sveltekit/remote`.

## Install the integration

Start with an existing SvelteKit 2 application. The adapter supports `@sveltejs/kit` 2.x and Node.js 22 or newer.

<!-- docs:package-manager -->
```sh
# Bun
bun add @hulla/api @hulla/api-sveltekit zod

# npm
npm install @hulla/api @hulla/api-sveltekit zod

# pnpm
pnpm add @hulla/api @hulla/api-sveltekit zod

# Yarn
yarn add @hulla/api @hulla/api-sveltekit zod
```

## Define the contract and implementation

Keep the contract in shared code. This example declares `GET /api/health` and `POST /api/rename`:

```ts
// src/lib/api/contract.ts
import { defineContract, response, route } from '@hulla/api'
import { z } from 'zod'

export const renameInput = z.object({ name: z.string().min(1) })
export const healthUnavailable = z.object({ message: z.string() })

export const contract = defineContract({
  basePath: '/api',
  routes: {
    health: route.get('/health', {
      responses: {
        200: response.text(),
        503: response.json(healthUnavailable),
      },
    }),
    rename: route.post('/rename', {
      body: renameInput,
      responses: { 200: response.json(renameInput) },
    }),
  },
})
```

Implement the same route tree in server code:

```ts
// src/lib/server/api.ts
import { defineServer } from '@hulla/api/server'
import { contract } from '$lib/api/contract'

export const implementation = defineServer(contract).implement({
  health: ({ response }) => response(200, 'ok'),
  rename: ({ body, response }) => response(200, body),
})
```

See [contract authoring](./contract-authoring.md) and [server implementations](./server-authoring.md) for the complete APIs.

## Mount a catch-all endpoint

Create a rest-parameter endpoint and export the mounted handler only under the methods declared by the sample contract:

```ts
// src/routes/api/[...api]/+server.ts
import { svelteKitAdapter } from '@hulla/api-sveltekit/server'
import { implementation } from '$lib/server/api'

const handler = svelteKitAdapter().mount(implementation)

export { handler as GET, handler as POST }
```

SvelteKit discovers endpoint methods from static named exports, so `mount()` returns one handler rather than a dynamically generated method map. The file route selects the catch-all; `@hulla/api` then matches the complete request method and URL against the mounted contract.

> Export only the methods present in the mounted implementation. Static method exports are part of SvelteKit's endpoint contract.

SvelteKit rest parameters can match an empty tail, so this file covers `/api` as well as nested paths such as `/api/health`. When a `GET` export exists without `HEAD`, SvelteKit supplies the GET handler for HEAD. The adapter dispatches that request through the contract's GET route and returns the status and headers without a body.

SvelteKit endpoints cannot expose `@hulla/api`'s `QUERY` method. `mount()` rejects an implementation or fragment containing one. Keep framework-specific `OPTIONS` behavior in the endpoint or a server hook when it is not part of the shared contract.

## Verify the HTTP boundary

Start the application with its normal development command. The port may differ in your project; the examples use `http://localhost:5173`.

```sh
curl -i http://localhost:5173/api/health
```

The endpoint returns the declared text response:

```http
HTTP/1.1 200 OK
content-type: text/plain

ok
```

```sh
curl -i \
  -X POST \
  -H 'content-type: application/json' \
  -d '{"name":"Ada"}' \
  http://localhost:5173/api/rename
```

The endpoint returns the declared JSON response:

```http
HTTP/1.1 200 OK
content-type: application/json

{"name":"Ada"}
```

## Consume the endpoint from `load`

Use SvelteKit's enhanced `fetch` inside `load` so server rendering inherits same-origin credentials, resolves relative requests, and can invoke internal endpoints without a network round trip:

```ts
// src/routes/+page.server.ts
import { createClient } from '@hulla/api/client'
import { fetchTransport } from '@hulla/api/fetch'
import { contract } from '$lib/api/contract'

export async function load({ fetch, url }) {
  const api = createClient(contract, {
    transport: fetchTransport({ baseUrl: url.origin, fetch }),
  })
  const result = await api.health()

  if (result.status !== 200) throw new Error(`Could not load health: ${result.status}`)
  return { health: result.body }
}
```

Keep SvelteKit form actions in charge of progressive enhancement and invalidation. They can call the same client when the deployed HTTP boundary itself must be exercised. For SvelteKit's zero-Fetch remote-function path, see [SvelteKit remote functions](./sveltekit-remote-functions.md).

## Native request-event context

Use `adapter.context()` when context construction needs SvelteKit request state:

```ts
// src/lib/api/server-with-context.ts
import { defineServer } from '@hulla/api/server'
import { svelteKitAdapter } from '@hulla/api-sveltekit/server'
import { contract } from '$lib/api/contract'

const adapter = svelteKitAdapter()

export const implementation = defineServer(contract, {
  context: adapter.context(({ request, route, svelteKitEvent }) => ({
    actor: svelteKitEvent.locals.actor,
    clientAddress: svelteKitEvent.getClientAddress(),
    operation: route.key,
    platform: svelteKitEvent.platform,
    request,
  })),
}).implement({
  health: ({ response }) => response(200, 'ok'),
  rename: ({ body, response }) => response(200, body),
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

A server `handle` hook should authenticate the request and populate `event.locals`. The `@hulla/api` context can then translate framework state into the smaller application context used by contract handlers. A context factory wrapped by `adapter.context()` is bound to `sveltekit`; mounting it through another adapter or generic `inProcessTransport()` fails early. The SvelteKit remote transport deliberately satisfies that same adapter requirement.

## Errors

Set a shared error hook on the adapter, or override it for one mounted fragment:

```ts
import { svelteKitAdapter } from '@hulla/api-sveltekit/server'
import { implementation } from '$lib/server/api'

const adapter = svelteKitAdapter({
  onError({ error, phase, request, route, svelteKitEvent, defaultResponse }) {
    console.error(
      phase,
      request.url,
      route?.key,
      svelteKitEvent.route.id,
      error
    )
    return defaultResponse
  },
})

const handler = adapter.mount(implementation)

export { handler as GET, handler as POST }
```

The hook receives `@hulla/api`'s protocol-safe default `Response`, the original SvelteKit event, the request, and matched contract metadata when available. Return a replacement `Response` to customize the result, or `undefined` to retain the default. Declared contract failures remain normal responses; use this hook for adapter or handler failures.

## Split large APIs with fragments

Use a fragment when a route group needs separate code-splitting, middleware, deployment, or ownership boundaries. Mount it from a narrower `+server.ts` file and export only the methods declared by that fragment. See [fragments and composition](./server-composition.md) for the complete `defineServer(contract.routes...)` patterns.

Keep SvelteKit's application data flow native: `load` orchestrates page data, form actions own progressive enhancement, and remote functions own their separate protocol and refresh lifecycle. For the remote transport and its zero-Fetch in-server dispatch, continue to [SvelteKit remote functions](./sveltekit-remote-functions.md).

Next, read [server and browser calls](./hybrid-rendering.md) to choose a transport, [context and middleware](./server-context.md) for shared policy, and [errors](./errors.md) for declared application failures.
