# Koa

Serve your contract's routes as Koa middleware with `@hulla/api-koa`. The example adds `GET /greeting`, checks the response, and passes Koa state to the handler.

## Before you start

Use Node.js 22 or newer with Koa 3 and `@types/koa` 3. Install the API packages and Koa runtime:

<!-- docs:package-manager -->

```sh
# Bun
bun add @hulla/api @hulla/api-koa koa && bun add -d @types/koa @types/node

# npm
npm install @hulla/api @hulla/api-koa koa && npm install --save-dev @types/koa @types/node

# pnpm
pnpm add @hulla/api @hulla/api-koa koa && pnpm add -D @types/koa @types/node

# Yarn
yarn add @hulla/api @hulla/api-koa koa && yarn add -D @types/koa @types/node
```

## Declare and implement one route

In `src/api/contract.ts`, declare the HTTP method, path, and response representation:

```ts
import { defineContract, response, route } from '@hulla/api'

export const contract = defineContract({
  routes: {
    greeting: route.get('/greeting', {
      responses: {
        200: response.text(),
      },
    }),
  },
})
```

In `src/api/server.ts`, implement the declared route:

```ts
import { defineServer } from '@hulla/api/server'
import { contract } from './contract'

export const implementation = defineServer(contract).implement({
  greeting: ({ response }) => response(200, 'Hello from Koa'),
})
```

The contract supplies the route shape; the implementation supplies its behavior. See
[contracts](./contract-authoring.md) and [server implementations](./server-authoring.md) for the complete authoring
APIs.

## Mount the implementation

Create the Koa application in `src/main.ts` and register the adapter result with `app.use()`:

```ts
import Koa from 'koa'
import { koaAdapter } from '@hulla/api-koa'
import { implementation } from './api/server'

const app = new Koa()

app.use(koaAdapter().mount(implementation))
app.listen(3000)
```

> `mount()` returns terminal Koa middleware. It answers unmatched paths itself and does not call middleware
> registered after it.

Start the application with your TypeScript runtime or compiled Node.js output, then request the contract path:

```sh
curl -i http://localhost:3000/greeting
```

```http
HTTP/1.1 200 OK
content-type: text/plain; charset=utf-8

Hello from Koa
```

The HTTP request crosses the Koa boundary, matches the contract route, runs `greeting`, and serializes its declared
text response.

## Add typed Koa state to server context

Use `adapter.context()` when existing Koa middleware places request data on `ctx` or `ctx.state`. This complete
`src/main.ts` alternative makes an authenticated actor available to the handler:

```ts
import Koa from 'koa'
import { koaAdapter } from '@hulla/api-koa'
import { defineServer } from '@hulla/api/server'
import { contract } from './api/contract'

type AppState = {
  actor: string
}

const app = new Koa<AppState>()
const adapter = koaAdapter<AppState>()

app.use(async (ctx, next) => {
  ctx.state.actor = 'Ada'
  await next()
  ctx.set('x-app', 'example')
})

const implementation = defineServer(contract, {
  context: adapter.context(({ ctx, state }) => ({
    actor: state.actor,
    method: ctx.method,
  })),
}).implement({
  greeting: ({ context, response }) =>
    response(200, `Hello ${context.actor} via ${context.method}`),
})

app.use(adapter.mount(implementation))
app.listen(3000)
```

The upstream middleware sets `ctx.state.actor` before the route runs. After `await next()`, it resumes and can
inspect or change the Koa response; here it adds `x-app: example`. Use the same adapter instance for
`adapter.context()` and `adapter.mount()` because native context is bound to its host adapter.

Prefer server context for request-specific Koa values. Application services that do not depend on `ctx` can remain
ordinary imports or dependencies of the handler module.

## Understand routing and middleware order

For a request handled by the mounted adapter:

1. Koa middleware registered before the adapter runs until it calls `next()`.
2. The shared router matches static or `:parameter` segments. It returns `404` for an unknown path and `405` with
   an `Allow` header when the path exists for another method.
3. The adapter decodes the declared inputs, creates server context, and runs `@hulla/api` server middleware and the
   route handler.
4. The declared response is serialized and assigned to the Koa response.
5. Upstream Koa middleware resumes after its `await next()`.

`HEAD` dispatches to the matching `GET` route but suppresses the response body. Static paths take precedence over
parameter paths. Because the mounted middleware is terminal, use application routing to decide when a separate
implementation or fragment should run. A fragment retains the full paths declared by its parent contract.

## Choose who parses request bodies

Koa does not parse request bodies by itself. The adapter can read the native Node request, or it can reuse a value
produced by earlier Koa middleware:

| Setup | Value read by the adapter | Body-size limit |
| --- | --- | --- |
| No preceding parser | Native JSON, text, bytes, or multipart request | `maxBodyBytes`; no adapter limit by default |
| Parser sets `ctx.request.body` | The parser's value | The parser's configured limit |

Set `maxBodyBytes` on `koaAdapter({ maxBodyBytes })` for every mount, or override it for one
`mount(implementation, { maxBodyBytes })` call. A parser-owned multipart value must already be a `FormData`
instance. Query values remain flat: one occurrence becomes a scalar and repeated keys become an array.

## Handle responses, failures, and disconnects

The adapter serializes the declared response through the shared Fetch representation layer, then assigns a Node
readable stream to `ctx.body`. Koa and Node retain response commitment, upstream middleware composition, stream
backpressure, and connection handling.

- Multiple `Set-Cookie` values remain separate headers.
- A raw declared response must be a Web `Response` whose status matches the declared contract status.
- `onError` can replace routing, request, context, handler, response, or early transport failures. If the hook throws,
  the adapter uses the protocol-safe default response.
- A producer failure after streaming starts is observational because the status and headers are already committed.
- The handler's `signal` aborts when the request is aborted or the response connection closes. Long-running work and
  stream producers must observe it cooperatively.

Continue with [server context and middleware](./server-context.md) for portable request state,
[server fragments and composition](./server-composition.md) for modular mounts, or
[adapter behavior](./adapter-conformance.md) for cross-host routing, parsing, and cancellation. For host middleware
details, see the [Koa documentation](https://koajs.com/).
