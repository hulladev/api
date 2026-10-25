# Bun

Pass a mounted Fetch handler to `Bun.serve()` to run your API. You don't need a separate Bun adapter. The example below serves a profile route and checks it with an HTTP request.

## Install the packages

The example uses Zod for its request and response schemas. No Bun-specific `@hulla/api` package is required.

<!-- docs:package-manager -->

```sh
# Bun
bun add @hulla/api zod

# npm
npm install @hulla/api zod

# pnpm
pnpm add @hulla/api zod

# Yarn
yarn add @hulla/api zod
```

## Declare and implement one route

Keep the contract in code shared by any clients and the server implementation in server-only code:

```ts
// src/api/contract.ts
import { defineContract, response, route } from '@hulla/api'
import { z } from 'zod'

export const contract = defineContract({
  basePath: '/api',
  routes: {
    profile: route.get('/profiles/:id', {
      params: z.object({ id: z.string() }),
      responses: {
        200: response.json(
          z.object({
            id: z.string(),
            runtime: z.literal('bun'),
          })
        ),
      },
    }),
  },
})
```

```ts
// src/api/server.ts
import { defineServer } from '@hulla/api/server'
import { contract } from './contract'

export const implementation = defineServer(contract).implement({
  profile: ({ params, response }) =>
    response(200, {
      id: params.id,
      runtime: 'bun',
    }),
})
```

The contract owns the `/api/profiles/:id` path and validates `id` before the handler runs. The implementation returns
the status and body declared by that route.

## Mount the handler in Bun

Create the Bun entrypoint at `src/index.ts`. `Bun.serve` receives the mounted Fetch handler directly:

```ts
// src/index.ts
import { fetchAdapter } from '@hulla/api/fetch'
import { implementation } from './api/server'

const handler = fetchAdapter().mount(implementation)

const server = Bun.serve({
  hostname: '127.0.0.1',
  port: Number(Bun.env['PORT'] ?? 3000),
  fetch: handler,
})

console.log(`Listening on ${server.url}`)
```

Start the server from the project root:

```sh
bun run src/index.ts
```

In another terminal, call the route through Bun's HTTP listener:

```sh
curl --include http://127.0.0.1:3000/api/profiles/user-1
```

The response proves both boundaries selected the route: Bun delivered the request to `handler`, and the adapter
matched the contract's `/api` base path and `profile` route.

```text
HTTP/1.1 200 OK
content-type: application/json

{"id":"user-1","runtime":"bun"}
```

## Keep Bun and the adapter responsibilities separate

Bun decides how the server listens and what happens before or after the Fetch handler. Configure its hostname, port,
TLS, logging, authentication, and platform limits in the Bun application. `fetchAdapter()` does not add a default body
limit; set its `maxBodyBytes` option when the application needs an adapter-owned byte budget, while still respecting
any limits imposed by Bun or an upstream proxy.

The handler uses Web `Request` and `Response` values. The adapter matches the request's full pathname, so a request to
`/profiles/user-1` does not match this contract even though Bun delivered it to the listener. If the contract declares
a body or a stream, the Fetch adapter reads and writes those Web representations; Bun remains responsible for the
underlying connection and listener lifecycle.

For adapter options and the client-side Fetch transport, read the [Fetch transport guide](/docs/api/transports/fetch).
For request-scoped values and middleware, read [server context](./server-context.md).

Use Bun's [HTTP server documentation](https://bun.sh/docs/runtime/http/server) for listener options and timeout
behavior. Those server settings can end a connection independently of the adapter, including a stream that stays idle
longer than the configured server timeout.
