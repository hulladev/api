# Node.js HTTP

`@hulla/api-node-http` turns a complete `@hulla/api` server implementation or deployable fragment into a Node.js
`RequestListener`. It uses only `node:http` and does not create or start a server.

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

## Create a Node server

```ts
import { createServer } from 'node:http'
import { nodeHttpAdapter } from '@hulla/api-node-http'
import { implementation } from './api/server'

const handler = nodeHttpAdapter().mount(implementation)
const server = createServer(handler)

server.listen(3000, '127.0.0.1', () => {
  console.log('Listening on http://127.0.0.1:3000')
})
```

The adapter receives Node's `IncomingMessage` and `ServerResponse`, then delegates method and pathname selection to the
compiled `@hulla/api` matcher. It preserves repeated query fields, decodes percent-encoded route parameters, normalizes
native headers, reads the declared request representation, and writes the selected response directly to the Node
response. A `HEAD` request executes the matching `GET` route while suppressing its body.

`mount()` also accepts one implementation fragment. Because the returned value is a catch-all listener, mount one
implementation or one composed fragment set per Node server:

```ts
const publicApi = serverDefinition.implement(contract.routes.public, publicHandlers)
const handler = nodeHttpAdapter().mount(publicApi)
```

Routes outside the selected fragment produce the same protocol-safe `404` response as any other unmatched path.

## Client consumption

The Node adapter only hosts the server implementation. Browser, mobile, and service consumers use the ordinary typed
Fetch client:

```ts
import { defineClient } from '@hulla/api/client'
import { fetchTransport } from '@hulla/api/fetch'
import { contract } from './api/contract'

export const api = defineClient(contract, {
  transport: fetchTransport({ baseUrl: 'http://127.0.0.1:3000' }),
}).create()
```

The result remains a status-discriminated union of the contract's responses. See
[client authoring](./client-authoring.md) and [client integrations](./plugins.md) for consumer-side composition.

## Native Node context

Use the adapter object's `context()` method when request context needs the Node socket, TLS state, remote address, or
headers:

```ts
import { defineServer } from '@hulla/api/server'
import { nodeHttpAdapter } from '@hulla/api-node-http'

const adapter = nodeHttpAdapter()
const serverDefinition = defineServer(contract, {
  context: adapter.context(({ request, response, route }) => ({
    remoteAddress: request.socket.remoteAddress,
    requestId: request.headers['x-request-id'],
    response,
    route,
  })),
})
```

The factory receives the original `IncomingMessage` as `request` and its paired `ServerResponse` as `response`.
`@hulla/api` owns the response write, so context code should not call `response.end()` independently.

Request bodies are one-shot Node streams. For a route with a declared body, the adapter reads and decodes that stream
before invoking the context factory and handler; the native request is therefore already consumed there. Read body data
from the handler's typed `body` field. Context factories should use the native request for metadata rather than attempt
to read its body a second time.

A context factory created with `adapter.context()` is bound to the `node-http` adapter. Mounting its implementation
through Fetch, Express, or the in-process transport fails during setup. Use a portable context factory when it only
needs route metadata or request-independent services.

## Request and response lifecycle

JSON, text, bytes, and form-data request bodies are decoded directly from the native request stream. The adapter does
not impose a second body-size policy; configure request limits at the reverse proxy or another boundary appropriate for
the deployment. Content types still have to match the contract declaration before a body is read.

JSON, text, and byte responses are written without constructing an intermediate Fetch response. Contract streams are
written chunk by chunk and pause when `ServerResponse.write()` signals backpressure. Raw Fetch responses and form data
retain their Web `Response` serialization, including multipart boundaries and multiple `set-cookie` headers. A closed
client connection stops further response writes.

## Error handling

Set defaults once on the adapter or override them for one mount:

```ts
const adapter = nodeHttpAdapter({
  onError({ error, phase, request, response, defaultResponse }) {
    console.error(phase, request.method, request.url, response.headersSent, error)
    return defaultResponse
  },
})

const handler = adapter.mount(implementation)
```

The hook receives the native request and response plus the protocol-safe default adapter response. It may return a
replacement adapter response or `undefined` to keep the default. Options passed to `mount()` shallowly override adapter
defaults. Errors that occur after response headers have already been written cannot be replaced; the adapter closes
that response instead.

## Scope

The adapter targets Node's stable HTTP/1 server API. HTTPS uses the same listener with `node:https.createServer()`.
HTTP/2 compatibility mode, WebSocket upgrades, `checkContinue`, `clientError`, TLS configuration, timeouts, connection
limits, and graceful shutdown remain server concerns and should be configured on the caller-owned Node server.
