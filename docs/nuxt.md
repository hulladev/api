# Nuxt

`@hulla/api-nuxt` mounts an `@hulla/api` server implementation in a Nuxt/Nitro server route and provides a
request-aware client transport for Nuxt data composables. Nuxt owns file routing, rendering, payload caching,
hydration, invalidation, and deployment; `@hulla/api` owns the shared HTTP contract, validation, middleware, handler
execution, and declared response decoding.

Import the Nitro adapter from `@hulla/api-nuxt/server` and the request-aware transport from
`@hulla/api-nuxt/client`. The package intentionally has no mixed root entrypoint.

Use this integration when the API is shared with mobile applications, generated clients, other services, or an
OpenAPI description. Keep one-off framework endpoints such as OAuth callbacks, signed webhooks, redirects, and raw
file handling as native Nitro handlers.

## Prerequisites

Define the shared contract and implementation outside Vue application code:

```ts
// shared/api/contract.ts
import { defineContract, response, route, router } from '@hulla/api'
import { z } from 'zod'

export const contract = defineContract({
  basePath: '/api',
  routes: {
    users: router('/users', {
      routes: {
        byId: route.get('/:id', {
          params: z.object({ id: z.string() }),
          responses: {
            200: response.json(z.object({ id: z.string(), name: z.string() })),
            404: response.json(z.object({ message: z.string() })),
          },
        }),
        rename: route.post('/:id', {
          params: z.object({ id: z.string() }),
          body: z.object({ name: z.string() }),
          responses: { 200: response.json(z.object({ id: z.string(), name: z.string() })) },
        }),
      },
    }),
  },
})
```

```ts
// server/utils/api.ts
import { defineServer } from '@hulla/api/server'
import { contract } from '~~/shared/api/contract'

export const implementation = defineServer(contract).implement({
  users: {
    byId: async ({ params }) => {
      const user = await findUser(params.id)
      return user
        ? { status: 200, body: user }
        : { status: 404, body: { message: 'User not found' } }
    },
    rename: async ({ params, body }) => ({
      status: 200,
      body: await renameUser(params.id, body.name),
    }),
  },
})
```

See [contract authoring](./contract-authoring.md) and [server authoring](./server-authoring.md) for schemas, codecs,
context, middleware, errors, and independently deployable fragments.

## Catch-all Nitro route

Mount the implementation under one Nuxt catch-all server route:

```ts
// server/api/[...hulla].ts
import { nuxtAdapter } from '@hulla/api-nuxt/server'
import { defineEventHandler } from 'h3'
import { implementation } from '../utils/api'

export default defineEventHandler(nuxtAdapter().mount(implementation))
```

Files in `server/api` receive Nuxt's `/api` prefix, while `[...hulla].ts` captures the remaining segments. The adapter
then matches the complete request method and URL against the mounted contract. Returning the standard `Response` lets
Nitro preserve status, headers, streaming, and deployment portability.

Nuxt server routes cannot expose `@hulla/api`'s `QUERY` method. `mount()` rejects an implementation or fragment that
contains one instead of leaving the operation unreachable. A `HEAD` request is dispatched through the contract's `GET`
route and returned without a body.

## Create a request-aware client

Create the client inside a Nuxt composable so `useRequestFetch()` captures the current SSR request:

```ts
// app/composables/useApi.ts
import { defineClient } from '@hulla/api/client'
import { nuxtFetchTransport } from '@hulla/api-nuxt/client'
import { contract } from '~~/shared/api/contract'

export function useApi() {
  const requestFetch = useRequestFetch()

  return defineClient(contract, {
    transport: nuxtFetchTransport(requestFetch),
  }).create()
}
```

`nuxtFetchTransport()` uses the raw-response side of Nuxt's `$fetch`. This matters because Hulla must retain the status,
headers, streaming body, and declared non-success responses rather than letting ofetch throw or eagerly decode them. A
relative URL also preserves Nitro's direct in-process dispatch during SSR. `useRequestFetch()` forwards the safe incoming
headers and cookies on the server and behaves like ordinary `$fetch` in the browser.

Do not construct a request-bound client once at module scope: that would capture no active Nuxt request or, worse, reuse
one request's credentials for another. Calling `useApi()` within setup, a plugin, route middleware, or another active
Nuxt context is safe.

## Initial and navigation data: `useAsyncData`

Nuxt recommends `useAsyncData` when an application has its own query layer. Wrap the typed Hulla call so Nuxt controls
SSR payload transfer, hydration deduplication, navigation blocking or laziness, refreshes, and shared keyed state:

```vue
<script setup lang="ts">
const route = useRoute()
const api = useApi()

const { data: user, error, refresh, status } = await useAsyncData(
  () => `user:${String(route.params.id)}`,
  async (_nuxtApp, { signal }) => {
    const result = await api.users.byId(
      { params: { id: String(route.params.id) } },
      { signal },
    )

    if (result.status === 404) throw createError({ status: 404, statusText: result.body.message })
    return result.body
  },
)
</script>
```

Use explicit stable keys in reusable composables so separate calls share only the intended Nuxt state. Pass
`useAsyncData`'s abort signal into the Hulla call so cancelled refreshes and navigations cancel the underlying request.
Options such as `lazy`, `server`, `dedupe`, `getCachedData`, and `watch` remain ordinary Nuxt decisions.

`useFetch` is the concise choice when a URL itself is the query layer. A Hulla client is already a typed query layer and
returns a status-discriminated union, so `useAsyncData` is the cleaner fit. Do not create a custom composable named
`useFetch`; Nuxt reserves and compiler-transforms that name.

## Event-driven mutations

Call the same client directly from browser interactions. Initial setup data belongs in `useAsyncData`, but wrapping an
event-driven write in it would incorrectly treat a side effect as cached page data:

```vue
<script setup lang="ts">
const api = useApi()
const route = useRoute()
const name = ref('')

async function submit() {
  const result = await api.users.rename({
    params: { id: String(route.params.id) },
    body: { name: name.value },
  })

  if (result.status !== 200) throw new Error(`Rename failed: ${result.status}`)
  await refreshNuxtData(`user:${String(route.params.id)}`)
}
</script>

<template>
  <form @submit.prevent="submit">
    <input v-model="name" />
    <button>Rename</button>
  </form>
</template>
```

Nuxt's plain `$fetch` is likewise intended for interaction-driven requests. The Hulla transport retains that request
behavior while adding the contract's input encoding and typed response union. Optimistic state, invalidation, navigation,
notifications, and error presentation remain explicit application concerns.

## Calls from Nitro handlers

Inside another server route, use that event's `$fetch` instance. Nitro forwards its request context and eligible headers
and can dispatch an internal relative route without a network round trip:

```ts
import { defineClient } from '@hulla/api/client'
import { nuxtFetchTransport } from '@hulla/api-nuxt/client'
import { defineEventHandler } from 'h3'
import { contract } from '~~/shared/api/contract'

export default defineEventHandler(async (event) => {
  const api = defineClient(contract, {
    transport: nuxtFetchTransport(event.$fetch),
  }).create()
  return api.users.byId({ params: { id: 'user-1' } })
})
```

Call shared application services directly instead when an HTTP-shaped boundary, declared status union, and independent
contract validation add no value.

## Native Nitro context

Bind the implementation to `nuxtAdapter()` when context construction needs the native H3 event:

```ts
import { nuxtAdapter } from '@hulla/api-nuxt/server'
import { defineServer } from '@hulla/api/server'
import { getCookie, getRequestIP } from 'h3'
import { contract } from '~~/shared/api/contract'

const adapter = nuxtAdapter()

export const implementation = defineServer(contract, {
  context: adapter.context(({ nuxtEvent, request, route }) => ({
    actor: nuxtEvent.context.auth,
    clientIP: getRequestIP(nuxtEvent),
    operation: route.key,
    session: getCookie(nuxtEvent, 'session'),
    signal: request.signal,
  })),
}).implement(/* handlers */)
```

`nuxtEvent` is the complete H3 event used by Nitro, including `context`, `$fetch`, `waitUntil`, route parameters, and the
native request/response bridge. `request` is the corresponding Web `Request`. The `route` field remains Hulla's
contract-derived operation metadata and is separate from Nitro's host-route parameters.

Nuxt server middleware can authenticate first and place trusted state on `event.context`. The Hulla context factory then
translates that framework state into the smaller application context used by handlers. A factory wrapped by
`adapter.context()` is bound to `nuxt`; mounting it through another adapter or the in-process transport fails early.

## Errors and fragments

Configure a shared error hook on the adapter or override it for one mounted fragment:

```ts
const adapter = nuxtAdapter({
  onError({ error, phase, request, route, nuxtEvent, defaultResponse }) {
    console.error(phase, request.url, route?.key, nuxtEvent.path, error)
    return defaultResponse
  },
})
```

The hook can retain the protocol-safe default response or return a replacement `Response`. Large APIs can mount
independently executable fragments under narrower catch-all routes to preserve Nitro code-splitting and ownership
boundaries.

## Why there is no remote-functions entrypoint

Current Nuxt uses explicit Nitro HTTP routes for client/server communication; it does not provide an official
remote-functions primitive comparable to SvelteKit's. The request-aware transport therefore follows Nuxt's established
data path: `useAsyncData` owns query lifecycle, `useRequestFetch` owns SSR request forwarding and local dispatch, and
Nitro owns the server route. If Nuxt adds a stable native server-function boundary later, it can receive a dedicated
zero-hop integration without changing the contract or server implementation.
