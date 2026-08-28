# Next.js

`@hulla/api-next` is a convenience layer over `@hulla/api/fetch` and Next.js's own data APIs. It does not replace
Next.js caching, generate Server Actions, or introduce another request lifecycle. Import server hosting APIs from
`@hulla/api-next/server` and client transport/cache APIs from `@hulla/api-next/client`. The package intentionally has
no mixed root entrypoint, so a client import cannot accidentally pull the server adapter into its graph.

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

## App Router Route Handlers

Mount a complete implementation or fragment in an optional catch-all Route Handler and alias the same handler to the
HTTP methods used by the contract:

```ts
// app/api/[[...api]]/route.ts
import { nextAdapter } from '@hulla/api-next/server'
import { implementation } from '@/api/server'

const handler = nextAdapter().mount(implementation)

export { handler as GET, handler as POST, handler as PUT, handler as PATCH, handler as DELETE }
```

The adapter accepts Next's native `NextRequest` and returns a standard `Response`, so it works in both Node.js and Edge
Route Handler runtimes when the implementation's own dependencies support that runtime. Export only methods the mounted
contract uses. Next.js handles methods without a named export, including its automatic `OPTIONS` behavior.

Next Route Handlers cannot expose `@hulla/api`'s `QUERY` method. `mount()` rejects an implementation or
fragment containing one, rather than leaving that route silently unreachable. Such a contract needs a host that can
register the method or a separate HTTP-facing contract using a supported method.

Use `nextAdapter()` when server context needs `NextRequest` features such as `cookies` or `nextUrl`:

```ts
import { defineServer } from '@hulla/api/server'
import { nextAdapter } from '@hulla/api-next/server'

type ApiRouteContext = RouteContext<'/api/[[...api]]'>

const adapter = nextAdapter<ApiRouteContext>()
const server = defineServer(contract, {
  context: adapter.context(async ({ request, route, routeContext }) => ({
    session: request.cookies.get('session')?.value,
    catchAll: (await routeContext.params).api,
    route,
  })),
})
```

The generic preserves Next's generated path-specific `RouteContext` parameter type. Omit it when the generic
`Record<string, string | string[] | undefined>` parameter shape is sufficient.

The adapter declaration is inherited by every implementation and fragment. Mounting one through Express, generic Fetch,
or `inProcessAdapter().mount()` fails immediately with an adapter mismatch instead of treating another native request as a
`NextRequest`. Context factories that use only portable route metadata remain usable through every adapter.

Pass `onError` to `nextAdapter()` to share it across mounted fragments. Its single input object contains the native
`NextRequest`, the typed `routeContext`, route metadata, and a clone of the protocol-safe default `Response`:

```ts
const adapter = nextAdapter<ApiRouteContext>({
  onError({ error, phase, request, routeContext, defaultResponse }) {
    console.error(phase, request.nextUrl.pathname, routeContext, error)
    return defaultResponse
  },
})

const handler = adapter.mount(implementation)
```

Options passed to `mount()` shallowly override the adapter defaults for that handler.

## Server-side fetch and the Data Cache

Server Components and other server-only code can use a contract-bound Next cache. Its contract-shaped `routes` policy
accepts only declared `GET` routes; route names, literal keys, and callback methods remain typed. Mutations cannot receive
a Data Cache policy through this high-level API:

```ts
import { defineClient } from '@hulla/api/client'
import { createNextCache } from '@hulla/api-next/client'

export const cache = createNextCache(contract, {
  namespace: 'public-api',
  routes: {
    users: {
      byId: (request) => ({
        cache: 'force-cache',
        next: {
          revalidate: 60,
          tags: [`path:${request.path}`],
        },
      }),
    },
  },
})

export const client = defineClient(contract, {
  transport: cache.fetchTransport({
    baseUrl: 'https://api.example.com',
  }),
}).create()
```

Call that client directly from a Server Component and narrow the declared response before rendering its body:

```tsx
// app/users/[id]/page.tsx
import { notFound } from 'next/navigation'
import { client } from '@/api/client'

export default async function UserPage({ params }: PageProps<'/users/[id]'>) {
  const { id } = await params
  const result = await client.users.byId({ params: { id } })

  if (result.status === 404) notFound()
  if (result.status !== 200) throw new Error(`Could not load user: ${result.status}`)

  return <h1>{result.body.name}</h1>
}
```

The policy callback for `users.byId` sees a literal `readonly ['users', 'byId']` key and a literal `GET` method. Policies
and structural tags are compiled once when `createNextCache()` runs; request dispatch does not serialize route keys or
walk the contract. The cache adds stable tags for the root and every router prefix. With the namespace above, it adds `public-api`,
`public-api:users`, and `public-api:users:byId`. Next still derives the actual cache entry key from the complete fetch
request, including encoded input. `@hulla/api-next` only supplies structural invalidation tags; custom tags are preserved and
deduplicated.

The default namespace is `hulla-api`. Give separate APIs distinct namespaces when they share one Next.js Data Cache. The
contract node is the typed selector, so misspelled string paths cannot compile:

```ts
const adminCache = createNextCache(contract, { namespace: 'admin-api' })

adminCache.tag(contract.routes.users)
adminCache.tags(contract.routes.users.byId)
```

Invalidate the same boundaries using `nextRouteTag()`:

```ts
import { revalidateTag } from 'next/cache'
import { cache } from '@/api/client'
import { contract } from '@/api/contract'

revalidateTag(cache.tag(contract.routes.users), 'max')
```

Cache behavior is opt-in. Routes without a policy receive no added options or tags. The lower-level `nextFetchTransport()`,
`nextFetchOptions()`, `nextRouteTag()`, and `nextRouteTags()` helpers remain available for dynamic policies and integration
authors, but contract-bound code should prefer `createNextCache()`. Next cache typing exposes only `force-cache` and
`no-store`, preventing browser-only `RequestCache` modes from being mistaken for supported server cache policy.

With Cache Components enabled, an `@hulla/api` client call can also live inside a function using the `use cache` directive. In that
model, use Next's `cacheLife()` and `cacheTag()` APIs directly: directives and their serialization boundaries are lexical
Next.js concerns and are not safe for an adapter to manufacture.

## Server Actions

Server Actions are application entry points, not an alternative `@hulla/api` transport. Keep them explicit so their
authorization, form decoding, redirects, optimistic UI, and invalidation remain visible:

```ts
'use server'

import { updateTag } from 'next/cache'
import { cache, client } from '@/api/client'
import { contract } from '@/api/contract'

export async function renameUser(id: string, name: string) {
  const result = await client.users.rename({ params: { id }, body: { name } })
  updateTag(cache.tag(contract.routes.users))
  return result
}
```

If the `@hulla/api` server and action share a process, `inProcessAdapter().mount()` can avoid a loopback HTTP request while preserving
the encoded client/server boundary, provided its server context is portable. An implementation declaring
`nextAdapter()` intentionally rejects in-process mounting; extract request-independent services or use a portable context
factory in that case. Calling a shared service directly is also appropriate when an HTTP-shaped response is unnecessary.
Server Action arguments must still be treated as untrusted and authorization must run inside the action or downstream
implementation.

## Client consumption and Pages Router

Client Components use a browser-safe ordinary Fetch client. Keep it separate from the server-only Data Cache setup so
the browser bundle does not import cache policy code:

```ts
// src/api/browser-client.ts
import { defineClient } from '@hulla/api/client'
import { fetchTransport } from '@hulla/api/fetch'
import { createSWR } from '@hulla/api-swr'
import { contract } from './contract'

export const api = defineClient(contract, {
  transport: fetchTransport(),
}).create()

export const apiSWR = createSWR(api)
```

With an omitted `baseUrl`, browser calls use the current origin and the paths declared by the contract. Pass the SWR
integration's tuple directly to the hook and narrow the declared status before consuming the response body:

```tsx
'use client'

import useSWR from 'swr'
import { apiSWR } from '@/api/browser-client'

export function UserName({ id }: { id: string }) {
  const user = useSWR(...apiSWR.users.byId.queryOptions({ params: { id } }))

  if (user.isLoading) return <p>Loading…</p>
  if (user.error) return <p>Could not load user.</p>
  if (user.data?.status === 404) return <p>User not found.</p>
  if (user.data?.status !== 200) return null

  return <p>{user.data.body.name}</p>
}
```

Use `@hulla/api-tanstack-query` instead when the application already uses TanStack Query. The Next adapter does not
mirror either client-side cache into the server Data Cache; invalidation must target each cache that owns the data.

The initial adapter targets App Router Route Handlers. Pages Router API Routes use Node's `NextApiRequest` and
`NextApiResponse` lifecycle and are intentionally not adapted. `getServerSideProps` and `getStaticProps` can call a normal
`@hulla/api` client, but new caching features and route handlers should use the App Router integration above.
