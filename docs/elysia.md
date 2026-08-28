# Elysia

`@hulla/api-elysia` registers a complete server implementation or deployable fragment on a caller-owned Elysia
application. Elysia continues to own routing, lifecycle hooks, decorators, stores, and deployment; `@hulla/api` owns contract
input decoding and declared response serialization.

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

## Mount on Elysia

```ts
import { elysiaAdapter } from '@hulla/api-elysia'
import { Elysia } from 'elysia'
import { implementation } from './api/server'

const app = new Elysia()
elysiaAdapter(app).mount(implementation)

export default app
```

Install Elysia alongside the adapter:

```bash
bun add @hulla/api @hulla/api-elysia elysia
```

The returned value is the same Elysia application. Call `app.listen()`, export `app`, or use `app.handle` with the
deployment integration appropriate for the target runtime.

## Client consumption

Elysia only hosts the server implementation. A browser, mobile application, or another service consumes the contract
through the ordinary typed Fetch client:

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

The host framework does not change the client call surface. The returned value is a status-discriminated union, so each
declared response narrows its body and headers. Put loading state, caching, retries, and mutations in the consuming
application; see [client authoring](./client-authoring.md) and [client integrations](./plugins.md).

## Native routes and lifecycle

`mount()` registers every selected contract route through Elysia's native `app.route(method, path, handler)` API. A
mounted fragment registers only its selected routes, and `mount()` returns the caller-owned app:

```ts
const users = server.implement(contract.routes.users, userHandlers)

app.onBeforeHandle(requireUser)
adapter.mount(users)
app.get('/healthz', () => 'ok')
```

Elysia route prefixes apply normally. For example, an app created with `new Elysia({ prefix: '/v1' })` mounts the
contract routes below `/v1`. Custom contract `QUERY` routes are registered through the same native routing API.

The adapter reads decoded path parameters from Elysia's route context. It reads headers and the raw query string from
the Web `Request`, preserving repeated query values, and decodes the body from that request. When an earlier Elysia
lifecycle hook has already parsed a JSON, text, or byte body, the adapter reuses that parsed value. Avoid body-aware
Elysia hooks before a form-data contract route when the exact native `FormData` field structure must be preserved.

Declared results become Web `Response` objects, including streaming responses. Elysia response lifecycle hooks can
inspect or replace them in the ordinary framework lifecycle.

## Elysia context in server context

Use `adapter.context()` only when the server context factory needs Elysia-specific state:

```ts
import { defineServer } from '@hulla/api/server'
import { elysiaAdapter } from '@hulla/api-elysia'
import { Elysia } from 'elysia'
import { contract } from './api/contract'

const app = new Elysia().state('requests', 0)
const adapter = elysiaAdapter(app)

const server = defineServer(contract, {
  context: adapter.context(({ request, elysiaContext, route }) => ({
    request,
    store: elysiaContext.store,
    server: elysiaContext.server,
    route,
  })),
})
```

The input contains:

- `request`: Elysia's native Web `Request`;
- `elysiaContext`: the typed Elysia context, including decorators, derived and resolved properties, store, server, and
  path parameters;
- `route`: `@hulla/api`'s structural route key, HTTP method, and full contract path.

The app type is inferred by `elysiaAdapter(app)`, so decorators, state, derives, and resolves installed before adapter
creation remain typed. Register those context extensions before creating the adapter when context code needs them.

Wrapping a context factory with `adapter.context()` binds that server definition to the `elysia` adapter. Mounting the
result with the generic Fetch adapter, another framework adapter, or the in-process transport fails immediately. Keep a
plain context factory when it needs only route metadata or request-independent services and should remain portable.

Body decoding runs before the `@hulla/api` context factory. For a native Elysia context factory, the adapter decodes through a
clone so the original `request` body remains readable by the factory.

## Error handling

The optional second argument to `elysiaAdapter()` sets defaults for every mounted implementation or fragment:

```ts
const adapter = elysiaAdapter(app, {
  onError({ error, phase, request, elysiaContext, defaultResponse }) {
    console.error(phase, request.url, elysiaContext.path, error)
    return defaultResponse
  },
})
```

The hook handles request decoding, `@hulla/api` context, route handler, middleware, and declared response serialization errors.
It receives the request's Elysia context and a protocol-safe default `Response`. Return a replacement `Response` or
return `undefined` to keep the default. Errors raised while converting the adapter result to a Web `Response` continue
to Elysia's own error lifecycle. Errors emitted later by a streaming response body propagate to the stream consumer.

Options passed to `mount()` shallowly override adapter defaults for that fragment. Passing `onError: undefined`
explicitly disables an inherited hook.
