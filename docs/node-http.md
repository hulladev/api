# Node.js HTTP

Pass a mounted `@hulla/api-node/http` listener to Node's `createServer()` to serve your API without a framework.

If your app already uses Express, Fastify, or Koa, use its [adapter](https://hulla.dev/docs/api/servers) to share the existing routes and middleware.

## Install the adapter

For TypeScript projects, `@hulla/api-node` expects `@types/node` 22 or later. This example uses Zod for request and
response schemas.

<!-- docs:package-manager -->

```sh
# Bun
bun add @hulla/api @hulla/api-node zod && bun add --dev @types/node

# npm
npm install @hulla/api @hulla/api-node zod && npm install --save-dev @types/node

# pnpm
pnpm add @hulla/api @hulla/api-node zod && pnpm add --save-dev @types/node

# Yarn
yarn add @hulla/api @hulla/api-node zod && yarn add --dev @types/node
```

## Mount a route and call it

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
          z.object({ id: z.string(), name: z.string() })
        ),
      },
    }),
  },
})
```

Implement the route in server-only code. The handler receives decoded, validated inputs, and `response()` only
accepts a status and body declared by the contract:

```ts
// src/api/server.ts
import { defineServer } from '@hulla/api/server'
import { contract } from './contract'

export const implementation = defineServer(contract).implement({
  renameUser: ({ params, body, response }) =>
    response(200, {
      id: params.id,
      name: body.name,
    }),
})
```

> `mount()` returns a Node request listener. It does not create a server, open a port, or choose deployment policy.

Give that listener to Node's `createServer()` and start the caller-owned server:

```ts
// src/server.ts
import { createServer } from 'node:http'
import { nodeHttpAdapter } from '@hulla/api-node/http'
import { implementation } from './api/server'

const handler = nodeHttpAdapter().mount(implementation)
const server = createServer(handler)

server.listen(3000, '127.0.0.1', () => {
  console.log('API listening on http://127.0.0.1:3000')
})
```

Once the server is running, send a real HTTP request:

```sh
curl -i -X PATCH http://127.0.0.1:3000/api/users/u_123 \
  -H 'content-type: application/json' \
  --data '{"name":"Grace"}'
```

The response has status `200`, an `application/json` content type, and this body:

```json
{"id":"u_123","name":"Grace"}
```

The request crossed Node's network server and the adapter boundary; it was not a direct call to the implementation.

## Follow the native request lifecycle

For each request passed to the listener:

1. Node supplies an `IncomingMessage` and its paired `ServerResponse`.
2. The adapter matches the method and pathname against the selected contract routes.
3. It decodes path parameters, preserves repeated query values, normalizes declared headers, and reads any declared
   body representation.
4. `@hulla/api` validates those inputs, creates server context, runs server middleware, and calls the handler.
5. The adapter serializes the declared result and writes it to the Node response.

Routing produces protocol-safe results without another router:

- an unmatched path returns `404`;
- a known path with the wrong method returns `405` and an `Allow` header;
- a `HEAD` request can execute a matching `GET` route, but the adapter suppresses its response body.

The listener handles every request passed to it, so mount one complete implementation or one composed fragment set
per Node server. When you mount a fragment, only its selected routes match; other paths return `404`. See
[server fragments and composition](./server-composition.md) for selecting and combining route groups.

## Choose request-body limits

For JSON, text, bytes, and form-data declarations, the adapter reads the one-shot `IncomingMessage` body once before
creating context or calling the handler. Use the handler's typed `body` field instead of reading the native stream a
second time.

The request outcome depends on both the contract and the configured byte limit:

| Condition | Result |
| --- | --- |
| Content type does not match the contract representation | `415` unsupported media type |
| Body cannot be decoded or validated | `400` invalid request |
| Body exceeds `maxBodyBytes` | `413` request body too large |

`maxBodyBytes` defaults to `Infinity`. Set a finite number to bound the bytes read by the adapter, including chunked
requests without a `Content-Length` header:

```ts
const adapter = nodeHttpAdapter({ maxBodyBytes: 1_048_576 })
const handler = adapter.mount(implementation)
```

Adapter defaults apply to every mount. Options passed to `mount()` shallowly override those defaults for that
implementation or fragment. A reverse proxy or deployment environment can enforce an additional limit before the
request reaches Node.

## Add Node state to server context

Keep context portable when it only needs application services or route metadata. Use `adapter.context()` when a
handler needs the native request, response, socket, or Node headers:

```ts
// src/api/server-with-node-context.ts
import { defineServer } from '@hulla/api/server'
import { nodeHttpAdapter } from '@hulla/api-node/http'
import { contract } from './contract'

const adapter = nodeHttpAdapter()

export const implementation = defineServer(contract, {
  context: adapter.context(({ request, route }) => ({
    remoteAddress: request.socket.remoteAddress,
    requestId: request.headers['x-request-id'],
    routeKey: route.key.join('.'),
  })),
}).implement({
  renameUser: ({ params, body, context, response }) => {
    console.info(context.requestId, context.routeKey)
    return response(200, { id: params.id, name: body.name })
  },
})

export const handler = adapter.mount(implementation)
```

The factory also receives the paired `ServerResponse` as `response`. For routes with a declared body, the native
request has already been consumed before the factory runs. Inspect request metadata there, but use the handler's
decoded `body` value and let the adapter finish the response.

`adapter.context()` binds this implementation to the `node-http` adapter. Mounting it through Fetch, Express, or the
in-process transport fails during setup instead of supplying an incompatible native request.

## Write responses and streams

The adapter writes JSON, text, and byte responses directly to `ServerResponse`. Raw Fetch responses and form-data
responses use Web `Response` serialization, which preserves multipart boundaries and separate `set-cookie` values.

Declared stream responses must yield `Uint8Array` chunks. The adapter:

- waits for Node's `drain` event when `ServerResponse.write()` signals backpressure;
- calls the source iterator's `return()` when the response closes early;
- aborts the handler's `signal` when the request or response connection closes.

Pass that signal to database queries, upstream `fetch()` calls, and stream producers that support cooperative
cancellation. A stream failure after response headers have been sent cannot replace the response already in flight.

## Handle adapter failures

Use `onError` to observe or replace failures while the adapter reads and validates inputs, creates context, runs
server middleware or the handler, serializes the declared response, or writes it through Node:

```ts
const adapter = nodeHttpAdapter({
  onError({ error, phase, request, response, defaultResponse }) {
    console.error(
      phase,
      request.method,
      request.url,
      response.headersSent,
      error
    )
    return defaultResponse
  },
})
```

The hook receives the native request and response plus a protocol-safe default adapter response. Return another
adapter response to replace it, or return `undefined` to keep the default. Response-write failures use
`phase: 'transport'`. Options passed to `mount()` override adapter defaults; `onError: undefined` disables an
inherited hook for that mount.

If response headers have already been sent, the hook can observe the failure but cannot replace the status or body.
The adapter closes that response instead.

## Keep server policy in the application

The adapter targets the `node:http` HTTP/1 request listener. The same listener can be passed to
`node:https.createServer()` when the application supplies TLS options. It does not provide a `node:http2` adapter.

The caller-owned server remains responsible for TLS, WebSocket upgrades, `checkContinue`, `clientError`, timeouts,
connection limits, and graceful shutdown. Configure those concerns on the Node server or at the deployment boundary;
they are not contract behavior.

## Next steps

- [Server context and middleware](./server-context.md) explains portable context and route policies.
- [Server fragments and composition](./server-composition.md) shows how to build one listener from selected route
  groups.
- [Typed clients](./client-authoring.md) calls this server through the same contract.
- [Node.js HTTP documentation](https://nodejs.org/api/http.html) covers the server lifecycle and native events.
