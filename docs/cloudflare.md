# Cloudflare Workers

`@hulla/api-cloudflare` mounts a Hulla server implementation in a Cloudflare Module Worker. It delegates the Web
`Request`/`Response` work to Hulla's Fetch adapter and adds typed access to Worker bindings and the request execution
context.

## Module Worker entrypoint

Use `createWorkerHandler()` as the default export's `fetch` method:

```ts
// src/index.ts
import { createWorkerHandler } from '@hulla/api-cloudflare'
import { implementation } from './api/server'

export default {
  fetch: createWorkerHandler(implementation),
} satisfies ExportedHandler<Env>
```

The adapter accepts complete implementations and deployable fragments. Routing, request decoding, response encoding,
streaming, declared errors, and protocol-safe 404/405 responses have the same behavior as `createFetchHandler()`.
Cloudflare Workers pass arbitrary HTTP methods to `fetch`, so Hulla `QUERY` routes remain available.

Declare `cloudflareAdapter()` with Wrangler's generated `Env` type when handlers need bindings or Worker lifecycle APIs:

```ts
import { defineServer } from '@hulla/api/server'
import { cloudflareAdapter } from '@hulla/api-cloudflare'

const server = defineServer(contract, {
  adapter: cloudflareAdapter<Env>(),
  context: ({ env, ctx, request, route }) => ({
    database: env.DB,
    request,
    route,
    defer: ctx.waitUntil.bind(ctx),
  }),
})
```

Run `wrangler types` in the Worker project so `Env` and the runtime globals match its compatibility date and flags. The
adapter's built-in `CloudflareExecutionContext` type contains the universally available `waitUntil()` and
`passThroughOnException()` methods. Pass the generated `ExecutionContext` as the second type argument when the context
factory also uses newer APIs such as `ctx.props`, `ctx.exports`, or `ctx.tracing`:

```ts
const server = defineServer(contract, {
  adapter: cloudflareAdapter<Env, ExecutionContext>(),
  context: ({ env, ctx }) => ({
    service: env.API,
    caller: ctx.props,
  }),
})
```

The adapter declaration is inherited by implementations and fragments. They fail immediately if mounted through generic
Fetch adapter, Express, or the in-process transport. Context factories using only portable route metadata remain usable
through every adapter.

`createWorkerHandler()` accepts `onError`. The hook receives the native `Request`, `env`, `ctx`, route metadata, and a
clone of the protocol-safe default `Response`; it may return a replacement `Response`. Native invocation state is passed
directly through the adapter error path, so concurrent invocations remain isolated even if a test reuses one `Request`
object.

## Scope

The adapter targets the current Module Worker `fetch(request, env, ctx)` entrypoint. The legacy Service Worker event
syntax is intentionally excluded because Cloudflare recommends Module Workers for new code.

Cloudflare Pages Functions are not aliases for the Worker entrypoint: they add file-based routing and a context object
with `params`, `data`, `next()`, and asset fallback behavior. They should get a separate integration if a concrete Pages
use case needs those semantics. Advanced-mode Pages projects that expose a Module Worker can use this adapter directly.

Scheduled, queue, email, and alarm handlers do not receive HTTP requests and therefore do not map to a Hulla API server.
Durable Objects have their own stateful lifecycle. Bindings for D1, KV, R2, Queues, service bindings, and Durable Object
namespaces need no adapter-specific APIs: expose them through `Env` and consume them from the context factory.
