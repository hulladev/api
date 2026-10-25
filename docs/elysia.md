# Elysia

Add your contract's routes to an existing Elysia app with `@hulla/api-elysia`. They run alongside your other routes and use the app's hooks and plugins.

## Install the adapter

The Elysia adapter supports Elysia 1.4 and later. This example uses Zod for its request and response schemas.

<!-- docs:package-manager -->

```sh
# Bun
bun add @hulla/api @hulla/api-elysia elysia zod

# npm
npm install @hulla/api @hulla/api-elysia elysia zod

# pnpm
pnpm add @hulla/api @hulla/api-elysia elysia zod

# Yarn
yarn add @hulla/api @hulla/api-elysia elysia zod
```

## Mount a contract route

Start with a contract that describes the HTTP boundary. This route accepts a user ID in the path and a new name in a
JSON body:

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
          z.object({ id: z.string(), name: z.string(), actor: z.string() })
        ),
      },
    }),
  },
})
```

Implement the route with `defineServer()`. The handler receives validated inputs, and `response()` only accepts statuses
and body shapes declared by the contract:

```ts
// src/api/server.ts
import { defineServer } from '@hulla/api/server'
import { contract } from './contract'

export const implementation = defineServer(contract, {
  context: () => ({ actor: 'Ada' }),
}).implement({
  renameUser: ({ params, body, context, response }) =>
    response(200, {
      id: params.id,
      name: body.name,
      actor: context.actor,
    }),
})
```

Create the Elysia app, pass it to `elysiaAdapter()`, and mount the implementation:

```ts
// src/app.ts
import { elysiaAdapter } from '@hulla/api-elysia'
import { Elysia } from 'elysia'
import { implementation } from './api/server'

const app = new Elysia()
const adapter = elysiaAdapter(app)

adapter.mount(implementation)

export default app
```

`mount()` returns that same `app`. You can keep adding native Elysia routes, call `app.listen()`, export the app for a
runtime integration, or exercise it directly with `app.handle()`:

```ts
const result = await app.handle(
  new Request('http://localhost/api/users/42', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Grace' }),
  })
)

console.log(result.status) // 200
console.log(await result.json())
// { id: '42', name: 'Grace', actor: 'Ada' }
```

That request enters through Elysia's native router. It is not a direct call to the server implementation.

## Add Elysia values to server context

Keep the context factory portable when it only needs services or route metadata. Use `adapter.context()` when handlers
need values supplied by Elysia, such as state, decorators, derives, resolves, or the native request context.

> Register Elysia extensions before calling `elysiaAdapter(app)` when the context factory needs their inferred types.

```ts
import { defineServer } from '@hulla/api/server'
import { elysiaAdapter } from '@hulla/api-elysia'
import { Elysia } from 'elysia'
import { contract } from './api/contract'

const app = new Elysia()
  .state('requestCount', 0)
  .decorate('serviceName', 'users')
  .derive(({ request }) => ({
    actor: request.headers.get('x-actor') ?? 'anonymous',
  }))

const adapter = elysiaAdapter(app)

const implementation = defineServer(contract, {
  context: adapter.context(({ request, elysiaContext, route }) => ({
    actor: elysiaContext.actor,
    serviceName: elysiaContext.serviceName,
    requestCount: elysiaContext.store.requestCount,
    requestId: request.headers.get('x-request-id'),
    routeKey: route.key.join('.'),
  })),
}).implement({
  renameUser: ({ params, body, context, response }) =>
    response(200, {
      id: params.id,
      name: body.name,
      actor: context.actor,
    }),
})

adapter.mount(implementation)
```

The factory receives:

- `request`: the native Web `Request`;
- `elysiaContext`: Elysia's typed context, including path parameters, state, decorators, derives, and resolves;
- `route`: the contract route key, HTTP method, and full path.

`adapter.context()` binds the implementation to the Elysia adapter. Mounting it with Fetch, another framework adapter,
or the in-process transport fails immediately. This prevents a handler from running without the host context it expects.

## Understand the request lifecycle

Each selected contract route is registered with Elysia's native `app.route(method, path, handler)` API:

1. Elysia matches the route and runs the lifecycle that precedes its handler.
2. The adapter reads path parameters, the raw query string, headers, and the declared body representation.
3. `@hulla/api` validates those inputs, creates server context, runs middleware, and calls the handler.
4. The declared result is serialized and converted to a Web `Response`.
5. Elysia's response lifecycle can inspect or replace that response.

This native registration has a few practical consequences:

- an Elysia prefix, such as `new Elysia({ prefix: '/v1' })`, also prefixes mounted contract routes;
- native Elysia routes can live beside contract routes;
- mounting a [server fragment](./server-composition.md) registers only that fragment's routes;
- custom contract `QUERY` routes use the same Elysia router;
- repeated query values are preserved because the adapter reads the raw URL query string.

## Choose who reads the body

Elysia may parse a request body before the mounted handler runs. The adapter checks whether the Web request has already
been consumed and chooses the available source:

| Request state | Body source | Limit owner |
| --- | --- | --- |
| No earlier hook consumed the body | The adapter reads the Web `Request` in the contract's JSON, text, bytes, or form-data representation. | `maxBodyBytes` limits the adapter-owned read. |
| Elysia already consumed the body | The adapter reuses `elysiaContext.body`. | Elysia's parser and limits own the earlier read. |

For an Elysia-parsed body, JSON and text values are reused directly. Bytes must be an `ArrayBuffer` or `Uint8Array`,
and form data must still be a native `FormData`. A body-aware hook that turns form data into a plain object therefore
cannot feed a form-data contract route.

The adapter does not impose a body limit by default. Set `maxBodyBytes` when adapter-owned reads need one:

```ts
const adapter = elysiaAdapter(app, { maxBodyBytes: 1_048_576 })
```

The limit is enforced while reading, including when `Content-Length` is missing. It cannot retroactively measure a body
that Elysia already consumed.

Contract body decoding happens before the server context factory. If an Elysia-bound context factory must also read the
original request body, mount with `preserveRequestBody: true`:

```ts
adapter.mount(implementation, { preserveRequestBody: true })
```

For an adapter-owned read, this decodes a cloned request and leaves the original request readable. Use it only when a
second consumer needs the body, because cloning can require buffering.

## Handle adapter failures

Pass `onError` to `elysiaAdapter()` for failures inside the adapter pipeline: input decoding, server context, middleware,
the route handler, declared response serialization, or conversion to the Web response:

```ts
const adapter = elysiaAdapter(app, {
  onError({ error, phase, request, elysiaContext, defaultResponse }) {
    console.error(phase, request.url, elysiaContext.path, error)
    return defaultResponse
  },
})
```

The hook receives a protocol-safe default `Response`. Return another `Response` to replace it, or return `undefined` to
keep the default. Options passed to `mount()` shallowly override adapter defaults for that mount. Passing
`onError: undefined` explicitly disables an inherited hook.

Failures raised by Elysia outside the adapter call remain part of Elysia's error lifecycle. If a response body is a
stream, a failure after streaming starts reaches the stream consumer; it cannot replace the response already in flight.
The request's `AbortSignal` is also passed through, so cancelling the request cancels contract work and response streams.

## Next steps

- [Server context and middleware](./server-context.md) explains portable request context and route policies.
- [Server fragments and composition](./server-composition.md) shows how to mount selected route groups.
- [Typed clients](./client-authoring.md) calls the same contract from a browser or another service.
- [Elysia documentation](https://elysiajs.com/) covers deployment and framework lifecycle details.
