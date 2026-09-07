# Fastify

`@hulla/api-fastify` registers a complete server implementation or deployable fragment on a caller-owned Fastify
application. Fastify continues to own routing, hooks, plugins, content-type parsing, and the server lifecycle; `@hulla/api` owns
contract input decoding and declared response serialization.

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

## Mount on Fastify

```ts
import Fastify from 'fastify'
import { fastifyAdapter } from '@hulla/api-fastify'
import { implementation } from './api/server'

const app = Fastify()

fastifyAdapter(app).mount(implementation)

await app.listen({ port: 3000 })
```

Install Fastify alongside the adapter:

```bash
bun add @hulla/api @hulla/api-fastify fastify
```

## Client consumption

Fastify only hosts the server implementation. A browser, mobile application, or another service consumes the contract
through the ordinary typed Fetch client:

```ts
import { defineClient } from '@hulla/api/client'
import { fetchTransport } from '@hulla/api/fetch'
import { contract } from './api/contract'

export const api = defineClient(contract, {
  transport: fetchTransport({ baseUrl: 'https://api.example.com' }),
})

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

## Native routes, hooks, and plugins

`mount()` registers each selected contract route through Fastify's native `app.route()` API and returns the same app
instance. A mounted fragment registers only its selected routes:

```ts
const users = server.implement(contract.routes.users, userHandlers)

app.addHook('preHandler', requireUser)
adapter.mount(users)
app.get('/healthz', async () => 'ok')
```

Fastify's encapsulation still applies. To give mounted routes a prefix or plugin-scoped hooks and decorators, create the
adapter inside `register()`:

```ts
await app.register(
  async (instance) => {
    instance.addHook('preHandler', requireUser)
    fastifyAdapter(instance).mount(implementation)
  },
  { prefix: '/v1' }
)
```

The adapter uses Fastify's decoded `request.params`, `request.query`, `request.headers`, and `request.body`. Fastify's
built-in JSON and text parsers therefore run before `@hulla/api` validation. Byte and multipart contracts require a Fastify
content-type parser or plugin whose `request.body` value matches the contract's wire representation: `Uint8Array` for
bytes and Web `FormData` for form data. Fastify owns body limits and rejects unsupported content types before the route
handler runs.

Declared JSON, text, byte, empty, stream, form-data, and raw Fetch responses are sent through `reply`, so response hooks
remain active. Streaming bodies are exposed to Fastify as Web `ReadableStream` instances without buffering.

## Fastify state in server context

Use `adapter.context()` only when the server context factory needs Fastify-specific state:

```ts
const adapter = fastifyAdapter(app)

const server = defineServer(contract, {
  context: adapter.context(({ request, reply, route }) => ({
    logger: request.log,
    requestId: request.id,
    server: request.server,
    reply,
    route,
  })),
})
```

The input contains Fastify's native `request` and `reply` plus `@hulla/api`'s structural route metadata. Fastify request and
reply decorations remain available through the framework's usual TypeScript module augmentation. Context code should
not send an independent reply; the declared route result remains the response owned by `@hulla/api` and Fastify.

Wrapping a context factory with `adapter.context()` binds that server definition to the `fastify` adapter. Mounting the
result with another framework adapter or the in-process transport fails immediately. Keep a plain context factory when
it only needs route metadata or request-independent services and should remain portable.

## Error handling

The optional second argument to `fastifyAdapter()` sets defaults for every mounted implementation or fragment:

```ts
const adapter = fastifyAdapter(app, {
  onError({ error, phase, request, reply, defaultResponse }) {
    request.log.error({ error, phase }, '@hulla/api request failed')
    reply.header('x-request-id', request.id)
    return defaultResponse
  },
})
```

The hook handles `@hulla/api` request decoding, context, route handler, middleware, and declared response serialization errors.
It receives the native Fastify request and reply alongside the protocol-safe default adapter response. Return a
replacement adapter response or `undefined` to keep the default. Errors raised later while the adapter prepares a reply
continue to Fastify's own error handler, and stream errors propagate through Fastify's response pipeline.

Options passed to `mount()` shallowly override adapter defaults for that fragment. Passing `onError: undefined`
explicitly disables an inherited hook.
