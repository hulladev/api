# SvelteKit remote functions

A SvelteKit remote function lets browser code ask the server to do work. With `@hulla/api-sveltekit/remote`, a `query`, `form`, or `command` can call your API implementation directly on the server.

Use this to reuse handlers inside your SvelteKit app. If a mobile app or another service needs to call them, [add an HTTP endpoint](./sveltekit.md) too.

## Prerequisites

This page assumes an existing SvelteKit 2 application and a server-capable deployment. [Remote functions](https://svelte.dev/docs/kit/remote-functions) are available from SvelteKit 2.27 and remain experimental. Enable both required options:

```js
// svelte.config.js
export default {
  compilerOptions: {
    experimental: { async: true },
  },
  kit: {
    experimental: { remoteFunctions: true },
  },
}
```

Install the core package, SvelteKit adapter, and schema library:

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

Import endpoint APIs from `@hulla/api-sveltekit/server` and the remote transport from `@hulla/api-sveltekit/remote`. The package has no mixed root entrypoint because the remote entrypoint depends on SvelteKit's generated `$app/server` module.

## Define the contract and implementation

Keep the contract in shared code. This example declares one read and one mutation:

```ts
// src/lib/api/contract.ts
import { defineContract, response, route } from '@hulla/api'
import { z } from 'zod'

export const renameInput = z.object({
  name: z.string().min(1),
})
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

Implement the same route tree in a server-only module:

```ts
// src/lib/server/api.ts
import { defineServer } from '@hulla/api/server'
import { contract } from '$lib/api/contract'

export const implementation = defineServer(contract).implement({
  health: ({ response }) => response(200, 'ok'),
  rename: ({ body, response }) => response(200, body),
})
```

The remote transport accepts a complete implementation or a server fragment. It does not require the `+server.ts` endpoint to be mounted first.

## Create remote query and command functions

Create a remote module that imports the SvelteKit remote factories and the adapter transport:

```ts
// src/routes/health.remote.ts
import { command, query } from '$app/server'
import { createClient } from '@hulla/api/client'
import { svelteKitRemoteTransport } from '@hulla/api-sveltekit/remote'
import { error } from '@sveltejs/kit'
import { contract, renameInput } from '$lib/api/contract'
import { implementation } from '$lib/server/api'

const api = createClient(contract, {
  transport: svelteKitRemoteTransport(implementation),
})

export const health = query(async () => {
  const result = await api.health()

  if (result.status === 503) error(503, result.body.message)

  return result.body
})

export const rename = command(renameInput, async (body) => {
  const result = await api.rename({ body })

  if (result.status !== 200) {
    throw new Error(`Unexpected rename status: ${result.status}`)
  }

  return result.body
})
```

The Standard Schema passed to `command()` validates the generated remote-function argument. `@hulla/api` independently validates the contract request and response. Keep both declarations aligned when they describe the same input.

Call the generated functions from a Svelte component:

```svelte
<!-- src/routes/+page.svelte -->
<script lang="ts">
  import { health, rename } from './health.remote'
</script>

<main>
  <p>API status: {await health()}</p>
  <button type="button" onclick={() => rename({ name: 'Ada' })}>
    Rename
  </button>
</main>
```

Use SvelteKit's `form()` when the mutation should be attached to a form and use SvelteKit's form lifecycle. The same `svelteKitRemoteTransport()` client can be called from the form callback; see SvelteKit's [remote functions](https://svelte.dev/docs/kit/remote-functions) documentation for form fields, pending state, and progressive enhancement.

## Understand the two boundaries

There are two distinct stages in a browser remote-function call:

1. SvelteKit's generated remote-function protocol sends the browser invocation to the server and serializes the result back to the browser.
2. Inside the server callback, `svelteKitRemoteTransport()` dispatches directly to the `@hulla/api` implementation without calling global `fetch`, constructing a Web `Request`, or routing through the catch-all `+server.ts` endpoint.

This is a zero-Fetch contract dispatch inside SvelteKit's server callback, not a claim that the browser-to-server remote-function flow has no HTTP or transport protocol.

SvelteKit owns remote query deduplication, refreshes, single-flight mutations, live connections, and serialization. `@hulla/api` owns the contract call and its status-discriminated result. The `health` query maps the declared `503` result into a SvelteKit error; return a value instead when the UI should inspect a non-success status itself.

## Use SvelteKit request context

An implementation created with `svelteKitAdapter().context()` can run through both the endpoint adapter and the remote transport. The remote transport reads the current SvelteKit `RequestEvent` and supplies it to the same context factory:

```ts
// src/lib/server/api-with-context.ts
import { defineServer } from '@hulla/api/server'
import { svelteKitAdapter } from '@hulla/api-sveltekit/server'
import { contract } from '$lib/api/contract'

const adapter = svelteKitAdapter()

export const implementation = defineServer(contract, {
  context: adapter.context(({ request, route, svelteKitEvent }) => ({
    actor: svelteKitEvent.locals.actor,
    operation: route.key,
    request,
  })),
}).implement({
  health: ({ response }) => response(200, 'ok'),
  rename: ({ body, response }) => response(200, body),
})
```

Use trusted `locals` or cookies for authorization. Do not authorize from the page route, URL, or params supplied by the remote-function caller. The `request` and `svelteKitEvent.request` describe SvelteKit's generated remote request; `route` describes the matched `@hulla/api` operation.

Do not substitute generic `inProcessTransport()` for this transport: it cannot supply the SvelteKit-bound `RequestEvent` required by `adapter.context()`.

SvelteKit does not expose `getRequestEvent()` to `prerender` callbacks. A remote `prerender` function can therefore use this transport only with a context-free implementation or fragment. `query.live` adds SvelteKit-owned connection and iterator lifecycle on top of the same callback boundary.

## Choose endpoint or remote function

| Need | Use |
| --- | --- |
| External client, browser Fetch, mobile app, generated client, or OpenAPI | [`@hulla/api-sveltekit/server`](./sveltekit.md) and a `+server.ts` endpoint |
| SvelteKit page data that should use the HTTP endpoint | SvelteKit `load` with its enhanced `event.fetch` |
| Application-local query, command, or form | This page and `svelteKitRemoteTransport()` |
| Operation that needs no shared contract boundary | Native SvelteKit load/action or another application function |

For the broader transport model, read [server and browser calls](./hybrid-rendering.md). For endpoint context and errors, return to [the SvelteKit endpoint guide](./sveltekit.md).
