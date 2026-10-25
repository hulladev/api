# Next.js data and caching

Use `@hulla/api-next/client` to cache server-side API requests with Next.js. Set how long a result stays fresh, give it a tag, and invalidate that tag after a write.

The examples build on the user routes from the [Next.js integration](./next.md).

## Pick the cache that owns the result

Next applications often have more than one cache. Choose the one whose lifecycle matches the caller:

| Cache | Applies to | Configure it with |
| --- | --- | --- |
| Next Data Cache | Server-side `fetch` results | `createNextCache()` on this page |
| Cache Components | Values cached inside a `use cache` scope | Next's `cacheLife()` and `cacheTag()` |
| SWR or TanStack Query | Browser-owned query state | The matching query-library integration |

Invalidating one does not invalidate the others. For example, a Next Data Cache tag does not refresh an SWR key in an already-hydrated browser.

> Fetching your own Route Handler from a Server Component creates an extra HTTP hop and may not work during prerendering. Use `inProcessTransport()` for a colocated implementation, or use a Cache Component around the local call when Next should cache its result. Use Data Cache policy when HTTP is the boundary you intend to exercise.

## Add policy to declared GET routes

Create the cache and its server-only client together:

```ts
// src/api/cached-client.ts
import 'server-only'

import { createClient } from '@hulla/api/client'
import { createNextCache } from '@hulla/api-next/client'
import { contract } from './contract'

export const apiCache = createNextCache(contract, {
  namespace: 'public-api',
  routes: {
    users: {
      byId: {
        cache: 'force-cache',
        next: { revalidate: 60 },
      },
    },
  },
})

export const api = createClient(contract, {
  transport: apiCache.fetchTransport({
    baseUrl: process.env.API_ORIGIN!,
  }),
})
```

`routes` follows the contract's key tree. Only declared `GET` routes accept a policy; adding one to `users.rename` is a type error and is rejected at runtime if untyped input reaches the API.

Routes without a policy receive no added Next fetch options or structural tags. A policy may also be a callback when options depend on the encoded request:

```ts
byId: (request) => ({
  cache: 'force-cache',
  next: {
    revalidate: request.params?.id === 'ada' ? 300 : 60,
    tags: [`user:${request.params?.id ?? 'unknown'}`],
  },
})
```

The contract policy tree is checked when `createNextCache()` runs. A callback policy is evaluated for each matching request.

## Read from a Server Component

Call the typed client and narrow the declared response before rendering its body:

```tsx
// app/users/[id]/page.tsx
import { notFound } from 'next/navigation'
import { api } from '@/api/cached-client'

export default async function UserPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const result = await api.users.byId({ params: { id } })

  if (result.status === 404) notFound()
  if (result.status !== 200) {
    throw new Error(`Could not load user: ${result.status}`)
  }

  return <h1>{result.body.name}</h1>
}
```

For `users.byId`, the client supplies these structural tags in addition to any custom tags:

```text
public-api
public-api:users
public-api:users:byId
```

This hierarchy lets a mutation invalidate one route, the `users` router, or the complete API namespace. Route-key segments are URL-encoded; custom tags are preserved and duplicates are removed. Next currently accepts at most 128 tags per request and 256 characters per tag, and the helper enforces those limits.

The package supplies fetch options and tags. Next determines the cache key and executes the cache behavior; consult Next's [`fetch` reference](https://nextjs.org/docs/app/api-reference/functions/fetch) for those semantics.

## Invalidate after a Server Action

`cache.tag()` creates the exact string used by the transport. In a Next.js 16 Server Action, `updateTag()` immediately expires that boundary so later reads in the same user flow observe the mutation:

```ts
// app/users/actions.ts
'use server'

import { updateTag } from 'next/cache'
import { api, apiCache } from '@/api/cached-client'
import { contract } from '@/api/contract'

export async function renameUser(id: string, name: string) {
  // Authenticate and authorize before performing the mutation.
  const result = await api.users.rename({
    params: { id },
    body: { name },
  })

  if (result.status !== 200) {
    throw new Error(`Could not rename user: ${result.status}`)
  }

  updateTag(apiCache.tag(contract.routes.users))
  return result.body
}
```

Server Actions are application entrypoints, not an `@hulla/api` transport. Their arguments are untrusted, and authorization still belongs in the action or downstream server implementation.

> `updateTag()` is a Next.js 16 API and is valid only in Server Actions. The package also supports Next.js 15; use the invalidation API and signature documented for the installed Next version.

Outside a Server Action, current Next.js can mark the same boundary stale with stale-while-revalidate behavior:

```ts
import { revalidateTag } from 'next/cache'

revalidateTag(apiCache.tag(contract.routes.users), 'max')
```

Use Next's [revalidation guide](https://nextjs.org/docs/app/getting-started/caching-and-revalidating) to choose between `updateTag()` and `revalidateTag()`.

## Keep the browser client separate

Client Components must not import the server-only cache module. Build a browser client from the shared contract and ordinary Fetch transport:

```ts
// src/api/browser-client.ts
import { createClient } from '@hulla/api/client'
import { fetchTransport } from '@hulla/api/fetch'
import { contract } from './contract'

export const api = createClient(contract, {
  transport: fetchTransport(),
})
```

With no `baseUrl`, browser requests use the current origin and reach the mounted `/api` Route Handler. Add SWR or TanStack Query on top when the browser should own query state; see [TanStack Query and SWR](./plugins.md). A server tag invalidation does not update that browser cache automatically, so invalidate or mutate the corresponding query key as part of the client workflow.

## Cache Components are a separate mechanism

With Next.js Cache Components enabled, `use cache`, `cacheLife()`, and `cacheTag()` cache a function or component scope. They do not consume the fetch policies above automatically, and `createNextCache()` cannot create the lexical `use cache` boundary for you.

For a colocated in-process client, a cached function can use `apiCache.tag(...)` as a shared tag string while Next owns the cache scope:

```ts
import { cacheLife, cacheTag } from 'next/cache'
import { apiCache } from '@/api/cached-client'
import { localApi } from '@/api/local-client'
import { contract } from '@/api/contract'

export async function getUser(id: string) {
  'use cache'
  cacheLife('minutes')
  cacheTag(apiCache.tag(contract.routes.users.byId))
  return localApi.users.byId({ params: { id } })
}
```

Cache Components require Next's `cacheComponents` configuration and currently run in the Node.js runtime. See Next's [`use cache` reference](https://nextjs.org/docs/app/api-reference/directives/use-cache) before adopting this model.

## Use lower-level helpers only when needed

`createNextCache()` is the normal contract-bound API. The `/client` entrypoint also exports lower-level pieces for integration code:

| Helper | Use it for |
| --- | --- |
| `nextFetchTransport()` | A Fetch transport with typed Next options but no contract policy tree |
| `nextFetchOptions()` | Add structural tags to explicit options for a known route key |
| `nextRouteTag()` | Create one tag from a route-key array |
| `nextRouteTags()` | Create the root-to-node tag hierarchy |

The default tag namespace is `hulla-api`. Give independently deployed or unrelated APIs distinct namespaces when they share a Data Cache.

## Next steps

- Return to [Next.js](./next.md) for Route Handler mounting and native context.
- Use [server and browser calls](./hybrid-rendering.md) to choose between HTTP, in-process, and framework-owned boundaries.
- Use [TanStack Query and SWR](./plugins.md) for browser cache keys and mutation workflows.
