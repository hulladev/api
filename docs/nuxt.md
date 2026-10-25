# Nuxt

Serve your API from a Nitro route and call it from a Nuxt page with `useAsyncData`. This lets your Nuxt app and other clients use the same API.

Import the server adapter from `@hulla/api-nuxt/server` and the request-aware client transport from `@hulla/api-nuxt/client`.

For a one-off webhook, OAuth callback, or redirect, use a native Nitro handler. Those requests usually need custom handling rather than a shared contract.

## Install the integration

Start with an existing Nuxt 3 or Nuxt 4 application using Node.js 22 or newer. The mounted route requires a server-capable deployment; a static-only output cannot execute it.

The file paths below use Nuxt 4's `app/` directory. In Nuxt 3, put the composable and page in the equivalent root-level `composables/` and `pages/` directories.

<!-- docs:package-manager -->
```sh
# Bun
bun add @hulla/api @hulla/api-nuxt zod

# npm
npm install @hulla/api @hulla/api-nuxt zod

# pnpm
pnpm add @hulla/api @hulla/api-nuxt zod

# Yarn
yarn add @hulla/api @hulla/api-nuxt zod
```

## Define the contract and implementation

Keep the contract outside Vue application code so server and client modules can share it. This example declares `GET /api/health`, `GET /api/users/:id`, and `POST /api/users/:id`:

```ts
// shared/api/contract.ts
import { defineContract, response, route, router } from '@hulla/api'
import { z } from 'zod'

const user = z.object({ id: z.string(), name: z.string() })
const renameInput = z.object({ name: z.string().min(1) })

export const contract = defineContract({
  basePath: '/api',
  routes: {
    health: route.get('/health', {
      responses: { 200: response.json(z.object({ ok: z.literal(true) })) },
    }),
    users: router('/users', {
      routes: {
        byId: route.get('/:id', {
          params: z.object({ id: z.string() }),
          responses: {
            200: response.json(user),
            404: response.json(z.object({ message: z.string() })),
          },
        }),
        rename: route.post('/:id', {
          params: z.object({ id: z.string() }),
          body: renameInput,
          responses: { 200: response.json(user) },
        }),
      },
    }),
  },
})
```

Implement the same route tree with deterministic example behavior:

```ts
// server/api-implementation.ts
import { defineServer } from '@hulla/api/server'
import { contract } from '~~/shared/api/contract'

const users = new Map([['ada', 'Ada']])

export const implementation = defineServer(contract).implement({
  health: ({ response }) => response(200, { ok: true }),
  users: {
    byId: ({ params, response }) => {
      const name = users.get(params.id)
      return name === undefined
        ? response(404, { message: 'User not found' })
        : response(200, { id: params.id, name })
    },
    rename: ({ params, body, response }) => {
      users.set(params.id, body.name)
      return response(200, { id: params.id, name: body.name })
    },
  },
})
```

> The in-memory map keeps the example runnable. Replace it with your application's durable store before deploying across multiple processes or regions.

See [contract authoring](./contract-authoring.md) and [server implementations](./server-authoring.md) for the complete APIs.

## Mount the catch-all Nitro route

Mount the implementation under one Nuxt catch-all server route:

```ts
// server/api/[...hulla].ts
import { nuxtAdapter } from '@hulla/api-nuxt/server'
import { defineEventHandler } from 'h3'
import { implementation } from '../api-implementation'

export default defineEventHandler(nuxtAdapter().mount(implementation))
```

Files in `server/api` receive Nuxt's `/api` prefix, while `[...hulla].ts` captures the remaining segments. The adapter
then matches the complete request method and URL against the mounted contract. Returning the standard `Response` lets
Nitro preserve status, headers, streaming, and deployment portability.

Nuxt server routes cannot expose `@hulla/api`'s `QUERY` method. `mount()` rejects an implementation or fragment that contains one. A `HEAD` request is dispatched through the contract's `GET` route and returned without a body. Nitro owns any `OPTIONS` behavior the application adds outside the shared contract.

## Verify the HTTP boundary

Start Nuxt with its normal development command. The examples use `http://localhost:3000`.

```sh
curl -i http://localhost:3000/api/health
```

The route returns the declared response:

```http
HTTP/1.1 200 OK
content-type: application/json

{"ok":true}
```

```sh
curl -i \
  http://localhost:3000/api/users/ada
```

```http
HTTP/1.1 200 OK
content-type: application/json

{"id":"ada","name":"Ada"}
```

```sh
curl -i \
  -X POST \
  -H 'content-type: application/json' \
  -d '{"name":"Grace"}' \
  http://localhost:3000/api/users/ada
```

```http
HTTP/1.1 200 OK
content-type: application/json

{"id":"ada","name":"Grace"}
```

## Create a request-aware client

Create the client inside a Nuxt composable so `useRequestEvent()` captures the current SSR request:

```ts
// app/composables/useApi.ts
import { createClient } from '@hulla/api/client'
import { nuxtFetchTransport } from '@hulla/api-nuxt/client'
import { contract } from '~~/shared/api/contract'

export function useApi() {
  const event = useRequestEvent()
  const requestFetch = event ? { fetch: event.fetch } : $fetch

  return createClient(contract, {
    transport: nuxtFetchTransport(requestFetch),
  })
}
```

`nuxtFetchTransport()` accepts `$fetch` in the browser or `{ fetch: event.fetch }` during SSR. Nitro's `event.fetch` forwards request context and eligible headers, dispatches relative local routes without a network hop, and preserves response status, headers, and streaming. Do not pass `useRequestFetch()` directly: its SSR result can be parsed-only and therefore cannot preserve the response metadata required by the contract transport.

Create the client inside an active Nuxt context. A module-scope client cannot capture the current request and could reuse the wrong request credentials; calling `useApi()` from setup, a plugin, route middleware, or another active Nuxt context is safe.

Keep `@hulla/api` external in the Vite SSR build when the shared contract is imported by both the Vue SSR bundle and Nitro. This lets Nitro resolve one copy of the contract's runtime state:

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  vite: { ssr: { external: ['@hulla/api'] } },
})
```

Keep the implementation in an explicitly imported server module such as `server/api-implementation.ts`. Placing it in Nitro's auto-imported `server/utils` directory can create an initialization cycle when the route module imports it.

## Load data with `useAsyncData`

Wrap the typed `@hulla/api` call so Nuxt controls SSR payload transfer, hydration deduplication, navigation, refreshes, and shared keyed state:

```vue
<!-- app/pages/users/[id].vue -->
<script setup lang="ts">
const route = useRoute()
const api = useApi()

const { data: user, error, refresh, status } = await useAsyncData(
  () => `user:${String(route.params.id)}`,
  async (_nuxtApp, { signal }) => {
    const result = await api.users.byId(
      { params: { id: String(route.params.id) } },
      { signal }
    )

    if (result.status === 404)
      throw createError({ status: 404, statusText: result.body.message })
    return result.body
  }
)
</script>

<template>
  <p v-if="status === 'pending'">Loading user…</p>
  <p v-else-if="error">{{ error.statusMessage }}</p>
  <p v-else>{{ user?.name }}</p>
  <RenameUserForm :id="String(route.params.id)" />
  <button type="button" @click="refresh">Refresh</button>
</template>
```

Use explicit stable keys in reusable composables so separate calls share only the intended Nuxt state. The handler must return a truthy value; pass `useAsyncData`'s abort signal into the `@hulla/api` call so cancelled refreshes and navigations cancel the underlying request. Options such as `lazy`, `server`, `dedupe`, `getCachedData`, and `watch` remain ordinary Nuxt decisions.

`useFetch` is the concise choice when a URL itself is the query layer. An `@hulla/api` client is already a typed query layer and
returns a status-discriminated union, so `useAsyncData` is the cleaner fit. Do not create a custom composable named
`useFetch`; Nuxt reserves and compiler-transforms that name.

## Event-driven mutations

Call the same client directly from browser interactions. Initial setup data belongs in `useAsyncData`, but wrapping an
event-driven write in it would incorrectly treat a side effect as cached page data:

```vue
<!-- app/components/RenameUserForm.vue -->
<script setup lang="ts">
const props = defineProps<{ id: string }>()
const api = useApi()
const name = ref('')

async function submit() {
  const result = await api.users.rename({
    params: { id: props.id },
    body: { name: name.value },
  })

  if (result.status !== 200) throw new Error(`Rename failed: ${result.status}`)
  name.value = ''
  await refreshNuxtData(`user:${props.id}`)
}
</script>

<template>
  <form @submit.prevent="submit">
    <input v-model="name" />
    <button>Rename</button>
  </form>
</template>
```

After a successful mutation, the component refreshes the `user:${id}` key used by `useAsyncData`, so the page reads the updated value. It uses Nuxt's event-driven `$fetch` behavior with contract encoding and typed responses.

Add optimistic state, notifications, and error messages in application code. If server code doesn't need contract validation or an HTTP-shaped boundary, call the shared application service directly.

## Native Nitro context

Bind the implementation to `nuxtAdapter()` when context construction needs the native H3 event:

```ts
// server/api-implementation.ts
import { nuxtAdapter } from '@hulla/api-nuxt/server'
import { defineServer } from '@hulla/api/server'
import { getCookie, getRequestIP } from 'h3'
import { contract } from '~~/shared/api/contract'

const adapter = nuxtAdapter()
const users = new Map([['ada', 'Ada']])

export const implementation = defineServer(contract, {
  context: adapter.context(({ nuxtEvent, request, route }) => ({
    actor: String(nuxtEvent.context.auth ?? 'anonymous'),
    clientIP: getRequestIP(nuxtEvent),
    operation: route.key,
    session: getCookie(nuxtEvent, 'session'),
    signal: request.signal,
  })),
}).implement({
  health: ({ response }) => response(200, { ok: true }),
  users: {
    byId: ({ params, response }) => {
      const name = users.get(params.id)
      return name === undefined
        ? response(404, { message: 'User not found' })
        : response(200, { id: params.id, name })
    },
    rename: ({ params, body, response }) => {
      users.set(params.id, body.name)
      return response(200, { id: params.id, name: body.name })
    },
  },
})
```

`nuxtEvent` is the complete H3 event used by Nitro, including `context`, host-route parameters, and the native request/response bridge. Nitro may add deployment-specific helpers to that event. `request` is the corresponding Web `Request`. The `route` field remains `@hulla/api`
contract-derived operation metadata and is separate from Nitro's host-route parameters.

Nuxt server middleware can authenticate first and place trusted state on `event.context`. The `@hulla/api` context factory then
translates that framework state into the smaller application context used by handlers. A factory wrapped by
`adapter.context()` is bound to `nuxt`; mounting it through another adapter or the in-process transport fails early.

## Handle adapter errors

Configure a shared error hook on the adapter or override it for one mounted fragment:

```ts
// server/api/[...hulla].ts
import { nuxtAdapter } from '@hulla/api-nuxt/server'
import { defineEventHandler } from 'h3'
import { implementation } from '../api-implementation'

const adapter = nuxtAdapter({
  onError({ error, phase, request, route, nuxtEvent, defaultResponse }) {
    console.error(phase, request.url, route?.key, nuxtEvent.path, error)
    return defaultResponse
  },
})

export default defineEventHandler(adapter.mount(implementation))
```

The hook can retain the protocol-safe default response or return a replacement `Response`. Declared contract failures are
already represented by the response union; use the hook for logging, redaction, and unexpected failures.

## Use fragments for separate host boundaries

Use a fragment when a group of operations needs a separate Nitro route prefix, middleware policy, or owner. Define the fragment from the same contract, limit it to those operations, and mount it from another default-exported Nitro handler. Fragments can reduce imported scope, but they do not guarantee code splitting in the final Nitro bundle. See [fragments and composition](./server-composition.md) for the complete fragment API.

## Next steps

For request authentication and middleware ownership, see Nuxt's [server directory and middleware
guide](https://nuxt.com/docs/4.x/directory-structure/server). For cache and revalidation choices, see Nuxt's
[`useAsyncData` documentation](https://nuxt.com/docs/4.x/api/composables/use-async-data). For larger contracts, continue with [server composition](./server-composition.md).
