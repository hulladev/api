# Hono

`@hulla/api-hono` registers a complete server implementation or deployable fragment on a caller-owned Hono
application. Hono continues to own routing, middleware, bindings, variables, and deployment; `@hulla/api` owns contract input
decoding and declared response serialization.

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

## Mount on Hono

```ts
import { honoAdapter } from '@hulla/api-hono'
import { Hono } from 'hono'
import { implementation } from './api/server'

const app = new Hono()
honoAdapter(app).mount(implementation)

export default app
```

Install Hono alongside the adapter:

```bash
bun add @hulla/api @hulla/api-hono hono
```

The returned app remains an ordinary Hono application. Export `app`, `app.fetch`, or a platform-specific Hono adapter
as required by the deployment target.

## Client consumption

Hono only hosts the server implementation. A browser, mobile application, or another service consumes the contract
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

## Native routes and middleware

`mount()` registers each selected contract route through Hono's native `app.on(method, path, handler)` API. A mounted
fragment registers only its selected routes, and `mount()` returns the same app instance:

```ts
const users = server.implement(contract.routes.users, userHandlers)

app.use('/api/users/*', requireUser)
adapter.mount(users)
app.get('/healthz', (context) => context.text('ok'))
```

Registration order is Hono middleware order. Middleware registered before the contract routes can run before and after
the `@hulla/api` handler, while a later matching handler does not run after a successful response. Unmatched requests continue
through Hono's router and not-found behavior.

The adapter reads decoded path parameters from `context.req.param()`, headers and query values from the native request,
and bodies through Hono's cached request-body methods. A body read by earlier Hono middleware remains available to the
contract decoder when that middleware used `context.req.json()`, `text()`, `arrayBuffer()`, or `formData()`. Avoid
consuming `context.req.raw` directly before the adapter if another handler must read the same body.

Responses are native Web `Response` objects, including streaming responses. Hono middleware can inspect or adjust the
response after `await next()` in the usual way.

## Hono context in server context

Use `adapter.context()` only when the server context factory needs Hono-specific state:

```ts
import { defineServer } from '@hulla/api/server'
import { honoAdapter } from '@hulla/api-hono'
import { Hono } from 'hono'
import { contract } from './api/contract'

type Env = {
  Bindings: { API_TOKEN: string }
}

const app = new Hono<Env>()
const adapter = honoAdapter(app)

const server = defineServer(contract, {
  context: adapter.context(({ request, honoContext, route }) => ({
    request,
    apiToken: honoContext.env.API_TOKEN,
    executionContext: honoContext.executionCtx,
    route,
  })),
})
```

The input contains:

- `request`: the native Web `Request` exposed by `honoContext.req.raw`;
- `honoContext`: Hono's typed `Context`, including `env`, variables installed with `set()`, request helpers, and
  platform-specific execution state;
- `route`: `@hulla/api`'s structural route key, HTTP method, and full contract path.

The environment type is inferred from the supplied Hono app. Context code should not finalize an independent response;
the declared route result remains the response owned by `@hulla/api` and Hono.

Wrapping a context factory with `adapter.context()` binds that server definition to the `hono` adapter. Mounting the
result with the generic Fetch adapter, another framework adapter, or the in-process transport fails immediately. Keep a
plain context factory when it only needs route metadata or request-independent services and should remain portable.

## Error handling

The optional second argument to `honoAdapter()` sets defaults for every mounted implementation or fragment:

```ts
const adapter = honoAdapter(app, {
  onError({ error, phase, request, honoContext, defaultResponse }) {
    console.error(phase, request.url, honoContext.req.path, error)
    return defaultResponse
  },
})
```

The hook handles request decoding, `@hulla/api` context, route handler, middleware, and declared response serialization errors.
It receives the request's Hono context and a protocol-safe default `Response`. Return a replacement `Response` or return
`undefined` to keep the default. Exceptions raised while the adapter converts that result to a Web `Response` continue
to Hono's own `app.onError()` handler. Errors emitted later by a streaming response body propagate to the stream
consumer.

Options passed to `mount()` shallowly override adapter defaults for that fragment. Passing `onError: undefined`
explicitly disables an inherited hook.
