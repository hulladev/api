# Next.js

`@hulla/api-next` is a convenience layer over Hulla's Fetch adapter and Next.js's own data APIs. It does not replace
Next.js caching, generate Server Actions, or introduce another request lifecycle. Import server hosting APIs from
`@hulla/api-next/server` and client transport/cache APIs from `@hulla/api-next/client`; the root entry remains a
compatibility convenience.

## App Router Route Handlers

Mount a complete implementation or fragment in an optional catch-all Route Handler and alias the same handler to the
HTTP methods used by the contract:

```ts
// app/api/[[...hulla]]/route.ts
import { createRouteHandler } from '@hulla/api-next/server'
import { implementation } from '@/api/server'

const handler = createRouteHandler(implementation)

export { handler as GET, handler as POST, handler as PUT, handler as PATCH, handler as DELETE }
```

The adapter accepts Next's native `NextRequest` and returns a standard `Response`, so it works in both Node.js and Edge
Route Handler runtimes when the implementation's own dependencies support that runtime. Export only methods the mounted
contract uses. Next.js handles methods without a named export, including its automatic `OPTIONS` behavior.

Next Route Handlers cannot expose Hulla's `QUERY` method. `createRouteHandler()` rejects a mounted implementation or
fragment containing one, rather than leaving that route silently unreachable. Such a contract needs a host that can
register the method or a separate HTTP-facing contract using a supported method.

Use `nextContext()` when server context needs `NextRequest` features such as `cookies` or `nextUrl`:

```ts
import { defineServer } from '@hulla/api/server'
import { nextContext } from '@hulla/api-next/server'

type ApiRouteContext = RouteContext<'/api/[[...hulla]]'>

const server = defineServer(contract, {
  context: nextContext<ApiRouteContext>()(async ({ request, route, routeContext }) => ({
    session: request.cookies.get('session')?.value,
    catchAll: (await routeContext.params).hulla,
    route,
  })),
})
```

The generic preserves Next's generated path-specific `RouteContext` parameter type. Omit it when the generic
`Record<string, string | string[] | undefined>` parameter shape is sufficient.

The adapter declaration is inherited by every implementation and fragment. Mounting one through Express, generic Fetch,
or `inProcessTransport()` fails immediately with an adapter mismatch instead of treating another native request as a
`NextRequest`. Context factories that use only portable route metadata remain usable through every adapter.

`createRouteHandler()` also accepts `onError`. Its single input object contains the native `NextRequest`, the typed
`routeContext`, route metadata, and a clone of the protocol-safe default `Response`:

```ts
createRouteHandler(implementation, {
  onError({ error, phase, request, routeContext, defaultResponse }) {
    console.error(phase, request.nextUrl.pathname, routeContext, error)
    return defaultResponse
  },
})
```

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

The policy callback for `users.byId` sees a literal `readonly ['users', 'byId']` key and a literal `GET` method. Policies
and structural tags are compiled once when `createNextCache()` runs; request dispatch does not serialize route keys or
walk the contract. The cache adds stable tags for the root and every router prefix. With the namespace above, it adds `public-api`,
`public-api:users`, and `public-api:users:byId`. Next still derives the actual cache entry key from the complete fetch
request, including encoded input. Hulla only supplies structural invalidation tags; custom tags are preserved and
deduplicated.

The default namespace is `hulla`. Give separate APIs distinct namespaces when they share one Next.js Data Cache. The
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

With Cache Components enabled, a Hulla call can also live inside a function using the `use cache` directive. In that
model, use Next's `cacheLife()` and `cacheTag()` APIs directly: directives and their serialization boundaries are lexical
Next.js concerns and are not safe for an adapter to manufacture.

## Server Actions

Server Actions are application entry points, not an alternative Hulla transport. Keep them explicit so their
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

If the Hulla server and action share a process, `inProcessTransport()` can avoid a loopback HTTP request while preserving
the encoded client/server boundary, provided its server context is portable. An implementation declaring
`nextContext()` intentionally rejects in-process mounting; extract request-independent services or use a portable context
factory in that case. Calling a shared service directly is also appropriate when an HTTP-shaped response is unnecessary.
Server Action arguments must still be treated as untrusted and authorization must run inside the action or downstream
implementation.

## Client Components and Pages Router

Client Components use the ordinary Fetch client. Add `@hulla/api-tanstack-query` or `@hulla/api-swr` when their cache and
mutation models are useful; the Next adapter does not mirror those client-side caches into the server Data Cache.

The initial adapter targets App Router Route Handlers. Pages Router API Routes use Node's `NextApiRequest` and
`NextApiResponse` lifecycle and are intentionally not adapted. `getServerSideProps` and `getStaticProps` can call a normal
Hulla client, but new caching features and route handlers should use the App Router integration above.
