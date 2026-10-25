# Hono

Add your contract's routes to a Hono app with `@hulla/api-hono`. Register them after the middleware they need so handlers can use its variables and bindings.

## Install the adapter

The adapter supports Hono `^4.12.31`. This example uses Zod for request and response schemas.

<!-- docs:package-manager -->

```sh
# Bun
bun add @hulla/api @hulla/api-hono hono zod

# npm
npm install @hulla/api @hulla/api-hono hono zod

# pnpm
pnpm add @hulla/api @hulla/api-hono hono zod

# Yarn
yarn add @hulla/api @hulla/api-hono hono zod
```

## Mount a route and verify it

Declare the HTTP boundary in a module shared by server and client code:

```ts
// src/api/contract.ts
import { defineContract, request, response, route } from '@hulla/api'
import { z } from 'zod'

export const contract = defineContract({
  basePath: '/api',
  routes: {
    renameUser: route.patch('/users/:id', {
      params: z.object({ id: z.string() }),
      body: request.json(z.object({ name: z.string().min(1) })),
      responses: {
        200: response.json(
          z.object({
            id: z.string(),
            name: z.string(),
            actor: z.string(),
          })
        ),
      },
    }),
  },
})
```

Implement the route in server-only code. The handler receives validated inputs, and `response()` only accepts a
status and body declared by the contract:

```ts
// src/api/server.ts
import { defineServer } from '@hulla/api/server'
import { contract } from './contract'

export const implementation = defineServer(contract).implement({
  renameUser: ({ params, body, response }) =>
    response(200, {
      id: params.id,
      name: body.name,
      actor: 'api',
    }),
})
```

Create the Hono app, register host middleware, and then mount the implementation:

```ts
// src/app.ts
import { honoAdapter } from '@hulla/api-hono'
import { Hono } from 'hono'
import { implementation } from './api/server'

export const app = new Hono()

app.use('/api/*', async (context, next) => {
  await next()
  context.header('x-host', 'hono')
})

const adapter = honoAdapter(app)
adapter.mount(implementation)

export default app
```

`mount()` registers every selected contract route through Hono's native `app.on()` API and returns that same
`app`. Verify the integration without opening a network port by using Hono's request helper:

```ts
// scripts/verify-api.ts
import { app } from '../src/app'

const result = await app.request('/api/users/u_123', {
  method: 'PATCH',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ name: 'Grace' }),
})

console.log(result.status) // 200
console.log(result.headers.get('x-host')) // hono
console.log(await result.json())
// { id: 'u_123', name: 'Grace', actor: 'api' }
```

The request enters Hono's router, runs the host middleware and mounted contract handler, and returns a standard Web
`Response`. For deployment, export `app`, `app.fetch`, or the entry point required by your Hono runtime. The
adapter does not start a server.

## Place routes in Hono's middleware flow

> Register Hono middleware before `mount()` when it must wrap a contract route. Hono uses registration order.

For a matched contract route:

1. Hono matches the method and path, then enters middleware registered before that route.
2. The adapter reads the declared inputs and `@hulla/api` validates them.
3. `@hulla/api` creates server context, runs its middleware, and calls the route handler.
4. The Web `Response` returns through the remainder of the Hono middleware stack.

A mounted handler returns a response without calling Hono's `next()`, so a matching handler registered later does
not run after it. Requests that do not match a contract route continue to Hono's other routes and not-found behavior.

Native Hono behavior still applies:

- `new Hono().basePath('/v1')` prefixes mounted contract paths with `/v1`;
- native routes can live beside mounted contract routes;
- mounting a [server fragment](./server-composition.md) registers only the fragment's selected routes;
- custom contract `QUERY` routes use Hono's router;
- repeated query values are preserved from the request URL.

## Decide who reads the request body

The adapter reads JSON, text, bytes, or form data according to the contract. Hono can safely inspect the same body
first when its cached request helpers are used:

| First reader | What the adapter reads | Consequence |
| --- | --- | --- |
| The adapter | The incoming Web `Request` | The adapter decodes the raw body as the contract's JSON, text, bytes, or form-data representation. |
| Hono middleware using `context.req.json()`, `text()`, `arrayBuffer()`, or `formData()` | A request reconstructed from Hono's body cache | Middleware and the contract route can inspect the same body. |
| Middleware consuming `context.req.raw` directly | No reusable cached body | The adapter cannot reconstruct the consumed body, so contract body decoding fails. |

The adapter imposes no body-size limit by default. Set `maxBodyBytes` to bound adapter-owned reads; proxy, platform,
and other host limits still apply:

```ts
const adapter = honoAdapter(app, { maxBodyBytes: 1_048_576 })
adapter.mount(implementation)
```

If an adapter-bound context factory also needs to read the native `request`, preserve it before contract decoding:

```ts
adapter.mount(implementation, { preserveRequestBody: true })
```

When the raw request is still unread, the adapter decodes a clone and leaves the original available to the context
factory. This cannot undo an earlier direct read of `context.req.raw`. If earlier middleware used a Hono request
helper, read the cached body again through `honoContext.req`. Preserve the request only for a real second consumer,
because the cloned branches can retain additional body data.

## Add Hono state to server context

Keep the context factory portable when it only needs application services or route metadata. Use
`adapter.context()` when handlers need Hono bindings, variables, request helpers, or platform execution state:

```ts
import { defineServer } from '@hulla/api/server'
import { honoAdapter } from '@hulla/api-hono'
import { Hono } from 'hono'
import { contract } from './api/contract'

type Env = {
  Variables: { actor: string }
}

const app = new Hono<Env>()
app.use('/api/*', async (context, next) => {
  context.set('actor', 'Ada')
  await next()
})

const adapter = honoAdapter(app)
const implementation = defineServer(contract, {
  context: adapter.context(({ request, honoContext, route }) => ({
    actor: honoContext.get('actor'),
    requestId: request.headers.get('x-request-id'),
    routeKey: route.key.join('.'),
  })),
}).implement({
  renameUser: ({ params, body, context, response }) => {
    console.info({
      requestId: context.requestId,
      route: context.routeKey,
    })
    return response(200, {
      id: params.id,
      name: body.name,
      actor: context.actor,
    })
  },
})

adapter.mount(implementation)
```

The factory receives:

- `request`: the native Web `Request`;
- `honoContext`: Hono's typed `Context`, including `env`, variables, request helpers, and execution state;
- `route`: the contract route key, HTTP method, and full path.

`adapter.context()` binds the implementation to the Hono adapter. Mounting it through Fetch, another framework
adapter, or the in-process transport fails immediately. Context code should return values for the server handler
rather than finalizing a separate Hono response.

## Separate adapter failures from Hono failures

Use `onError` for failures while the adapter decodes contract inputs, creates context, runs `@hulla/api`
middleware or the handler, serializes the declared result, or converts it to a Web `Response`:

```ts
const adapter = honoAdapter(app, {
  onError({ error, phase, request, honoContext, defaultResponse }) {
    console.error(phase, request.url, honoContext.req.path, error)
    return defaultResponse
  },
})
```

The hook receives Hono's context and a protocol-safe default `Response`. Return another `Response` to replace it,
or return `undefined` to keep the default. Options passed to `mount()` shallowly override adapter defaults for that
mount; `onError: undefined` disables an inherited hook.

Hono's `app.onError()` owns failures from Hono middleware and native routes outside the mounted adapter. If a stream
producer fails after its response has started, `onError` can observe the transport failure but cannot replace the
response already in flight.

## Handle streams and cancellation

Declared stream bodies must be iterable or async iterable and yield `Uint8Array` chunks. The adapter exposes the
source as a Web `ReadableStream` without collecting the complete body first. Finishing, cancelling, or failing the
stream closes its source iterator.

The native request's `AbortSignal` becomes the handler's `signal`. Use it to stop database, file, or network work
when the caller cancels the request.

## Next steps

- [Server context and middleware](./server-context.md) explains portable request context and route policies.
- [Server fragments and composition](./server-composition.md) shows how to mount selected route groups.
- [Typed clients](./client-authoring.md) calls the same contract from a browser or another service.
- [Hono documentation](https://hono.dev/docs/) covers routing, middleware, runtimes, and deployment.
