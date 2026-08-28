# Cloudflare

`@hulla/api-cloudflare` supports two Cloudflare HTTP boundaries. The package root mounts an `@hulla/api` server
implementation in a Module Worker, while `@hulla/api-cloudflare/pages` mounts one in a file-routed Pages Function. Both
delegate Web `Request`/`Response` execution to `@hulla/api/fetch` while retaining their distinct native context and
lifecycle types.

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

## Module Workers

Use the adapter's `mount()` result as the default export's `fetch` method:

```ts
// src/index.ts
import { cloudflareAdapter } from '@hulla/api-cloudflare'
import { implementation } from './api/server'

const adapter = cloudflareAdapter<Env>()

export default {
  fetch: adapter.mount(implementation),
} satisfies ExportedHandler<Env>
```

The adapter accepts complete implementations and deployable fragments. Routing, request decoding, response encoding,
streaming, declared errors, and protocol-safe 404/405 responses have the same behavior as the generic Fetch adapter.
Cloudflare Workers pass arbitrary HTTP methods to `fetch`, so `@hulla/api` `QUERY` routes remain available.

Use `cloudflareAdapter()` with Wrangler's generated `Env` type when context construction needs bindings or Worker lifecycle APIs:

```ts
import { defineServer } from '@hulla/api/server'
import { cloudflareAdapter } from '@hulla/api-cloudflare'

const adapter = cloudflareAdapter<Env>()
const server = defineServer(contract, {
  context: adapter.context(({ env, ctx, request, route }) => ({
    database: env.DB,
    request,
    route,
    defer: ctx.waitUntil.bind(ctx),
  })),
})
```

Run `wrangler types` in the Worker project so `Env` and the runtime globals match its compatibility date and flags. The
adapter's built-in `CloudflareExecutionContext` type contains the universally available `waitUntil()` and
`passThroughOnException()` methods. Pass the generated `ExecutionContext` as the second type argument when the context
factory also uses newer APIs such as `ctx.props`, `ctx.exports`, or `ctx.tracing`:

```ts
const adapter = cloudflareAdapter<Env, ExecutionContext>()
const server = defineServer(contract, {
  context: adapter.context(({ env, ctx }) => ({
    service: env.API,
    caller: ctx.props,
  })),
})
```

The native context requirement is inherited by implementations and fragments. They fail immediately if mounted through generic
Fetch adapter, Express, or the in-process adapter. Context factories using only portable route metadata remain usable
through every adapter.

Pass `onError` to `cloudflareAdapter()` to share it across every mounted implementation or fragment:

```ts
const adapter = cloudflareAdapter<Env>({
  onError({ error, phase, request, env, ctx, defaultResponse }) {
    console.error(phase, request.url, env, ctx, error)
    return defaultResponse
  },
})
```

The hook receives the native `Request`, `env`, `ctx`, route metadata, and a clone of the protocol-safe default
`Response`; it may return a replacement `Response`. Native invocation state is passed directly through the adapter error
path, so concurrent invocations remain isolated even if a test reuses one `Request` object. Options passed to `mount()`
shallowly override the adapter defaults.

## Pages Functions

Cloudflare recommends Workers for new server-side projects. Use the Pages integration for an existing Pages Functions
application or while migrating one incrementally. Advanced-mode Pages projects use the Module Worker adapter described
above.

### Catch-all Function

The examples assume that the contract uses `/api` as its `basePath`. Mount the implementation from one Pages catch-all
file beneath that prefix:

```ts
// functions/api/[[hulla]].ts
import { cloudflarePagesAdapter } from '@hulla/api-cloudflare/pages'
import { implementation } from '../../src/api/server'

const adapter = cloudflarePagesAdapter<Env, 'hulla'>()

export const onRequest = adapter.mount(implementation)
```

The generic `onRequest` export accepts every method that reaches the Function, including custom methods such as
`QUERY`. The adapter accepts complete implementations and deployable fragments. Request decoding, response encoding,
streaming, declared errors, and protocol-safe 404/405 responses match the generic Fetch adapter.

Placing the Function at `functions/api/[[hulla]].ts` lets Pages continue its normal static-asset routing outside `/api`.
Once a request reaches the mounted implementation, the contract owns that API boundary: an unmatched route returns the
`route-not-found` problem and does not call `context.next()` or `env.ASSETS.fetch()`. This avoids mistaking a declared
application 404 for a platform routing miss.

### Native context

Use the adapter's context declaration when context construction needs Pages bindings or lifecycle state:

```ts
import { defineServer } from '@hulla/api/server'
import { cloudflarePagesAdapter } from '@hulla/api-cloudflare/pages'

type PagesData = {
  actor?: { readonly id: string }
}

const adapter = cloudflarePagesAdapter<Env, 'hulla', PagesData>()
const server = defineServer(contract, {
  context: adapter.context(({ data, env, functionPath, params, request, route, waitUntil }) => ({
    actor: data.actor,
    database: env.DB,
    functionPath,
    pagesPath: params.hulla,
    request,
    route,
    defer: waitUntil,
  })),
})
```

The second type argument is the union of Pages file-route parameter names. A single-segment parameter is a string and a
double-bracket catch-all parameter is a string array. The third type argument describes `context.data`, which Pages
middleware can populate before the mounted Function runs. The context also includes `passThroughOnException()`,
`next()`, and `env.ASSETS.fetch()`.

Run `wrangler types` in the Pages project so `Env` and runtime globals match the deployment's bindings, compatibility
date, and flags. The portable `CloudflarePagesEventContext` type mirrors the Pages Function handler boundary without
requiring `@cloudflare/workers-types` as a package dependency.

A native Pages context factory binds its implementations and fragments to the `cloudflare-pages` adapter. Mounting one
through the Module Worker, generic Fetch, or in-process adapter fails immediately. Context factories using only portable
route metadata remain deployable through every compatible adapter.

### Error handling

Pass `onError` to `cloudflarePagesAdapter()` to share it across mounts, or override it for one implementation or
fragment:

```ts
const adapter = cloudflarePagesAdapter<Env, 'hulla', PagesData>({
  onError({ data, defaultResponse, env, error, functionPath, phase, request }) {
    console.error(phase, functionPath, request.url, env, data, error)
    return defaultResponse
  },
})
```

The hook receives the complete native event context, contract route metadata when routing reached a route, and a clone
of the protocol-safe default `Response`. It may return a replacement `Response`; returning `undefined` retains the
default. Options supplied to `mount()` shallowly override adapter defaults.

## Client consumption

The Cloudflare adapters only host the server implementation. Browser, mobile, and service consumers use the ordinary
contract-shaped client against the deployment or custom domain:

```ts
import { defineClient } from '@hulla/api/client'
import { fetchTransport } from '@hulla/api/fetch'
import { contract } from './api/contract'

export const api = defineClient(contract, {
  transport: fetchTransport({ baseUrl: 'https://api.example.com' }),
}).create()

export async function getUser(id: string) {
  const result = await api.users.byId({ params: { id } })

  if (result.status === 200) return result.body
  if (result.status === 404) return undefined
  throw new Error(`Could not load user: ${result.status}`)
}
```

The returned value is a status-discriminated union, so each declared response narrows its body and headers. The client
can run in another Worker as well as in a browser or Node.js service. Keep caching, retries, and UI state in the
consumer; see [client authoring](./client-authoring.md) and [client integrations](./plugins.md).

## Scope

The package root targets the current Module Worker `fetch(request, env, ctx)` entrypoint. The legacy Service Worker
event syntax is intentionally excluded. The `/pages` subpath targets Pages Functions' file-based `onRequest(context)`
boundary; an advanced-mode Pages project with `_worker.js` uses the package root instead.

Scheduled, queue, email, and alarm handlers do not receive HTTP requests and therefore do not map to an `@hulla/api` server.
Durable Objects have their own stateful lifecycle. Bindings for D1, KV, R2, Queues, service bindings, and Durable Object
namespaces need no adapter-specific APIs: expose them through `Env` and consume them from the context factory.
