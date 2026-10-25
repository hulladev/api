# Deno

Export a mounted Fetch handler to run your API with `deno serve`. The handler uses Deno's built-in `Request` and `Response` types, so no Deno-specific adapter is needed.

## Install the packages

The example uses Zod for its request and response schemas. Install the packages with the package manager used by your
project; Deno can resolve dependencies declared in `package.json` or in the `imports` map of `deno.json`.

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

If the project uses `deno.json` instead of `package.json`, map the same packages to npm specifiers:

```jsonc
// deno.json
{
  "imports": {
    "@hulla/api": "npm:@hulla/api",
    "@hulla/api/fetch": "npm:@hulla/api/fetch",
    "@hulla/api/server": "npm:@hulla/api/server",
    "zod": "npm:zod",
  },
}
```

## Declare and implement one route

The example serves `GET /api/profiles/:id`. Keep the contract in a module that can also be imported by a client:

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
            runtime: z.literal('deno'),
          })
        ),
      },
    }),
  },
})
```

Implement the route in server-only code, then expose the mounted Fetch handler:

```ts
// src/api/server.ts
import { defineServer } from '@hulla/api/server'
import { fetchAdapter } from '@hulla/api/fetch'
import { contract } from './contract.ts'

const adapter = fetchAdapter()

const implementation = defineServer(contract).implement({
  profile: ({ params, response }) =>
    response(200, {
      id: params.id,
      runtime: 'deno',
    }),
})

export const handler = adapter.mount(implementation)
```

The adapter reads the request pathname from the Web `Request`. The contract's `/api` base path therefore remains part
of the public URL; Deno does not remove it before the adapter matches the route.

## Create the Deno entrypoint

`deno serve` starts the listener and reads the default export from the entrypoint:

```ts
// deno.ts
import { handler } from './src/api/server.ts'

export default {
  fetch: handler,
} satisfies Deno.ServeDefaultExport
```

Start it from the project root. `deno serve` listens on port `8000` by default; `--host=127.0.0.1` keeps this local
example off the network interfaces of the development machine.

```sh
deno serve --host=127.0.0.1 --port=8000 deno.ts
```

Call the route from another terminal:

```sh
curl --include http://127.0.0.1:8000/api/profiles/user-1
```

The response proves that Deno invoked the Web handler and the adapter selected the contract route:

```text
HTTP/1.1 200 OK
content-type: application/json

{"id":"user-1","runtime":"deno"}
```

## Know which layer owns routing

Deno's `fetch` entrypoint receives every request. `@hulla/api` performs the second routing step inside that handler:

1. Deno accepts the connection and calls the exported `fetch` handler.
2. The Fetch adapter matches the method and full pathname against the contract.
3. It decodes and validates declared parameters, query values, headers, and body.
4. It creates server context, runs middleware, and calls the matching implementation.
5. It serializes the declared result as a Web `Response`.

An unmatched contract path returns 404; a known path with a disallowed method returns 405 with an `Allow` header. These
responses come from the adapter after Deno has already invoked the handler. Deno's listener, host binding, TLS, and any
reverse-proxy routing remain outside the contract.

## Keep Deno permissions and deployment separate

`deno serve` automatically grants the permission needed to listen for HTTP requests. Grant additional permissions only
for capabilities the application uses, such as `--allow-read` for filesystem access or `--allow-env` for environment
variables. The adapter does not request or broaden Deno permissions.

For a long-running server, deploy the same entrypoint with Deno's hosting or self-hosting workflow. Deno's deployment
configuration decides the process, hostname, environment, permissions, scaling, and resource limits; the mounted
handler remains unchanged. See [Deno deployment options](https://docs.deno.com/runtime/deploy/) for those choices.

When the application is part of a larger process and must control startup itself, use `Deno.serve()` instead:

```ts
// server.ts
import { handler } from './src/api/server.ts'

Deno.serve({ hostname: '127.0.0.1', port: 8000 }, handler)
```

Run this form with `deno run --allow-net server.ts`; grant other permissions only when the application uses them.
Deno passes a second `ServeHandlerInfo` argument to handlers. `fetchAdapter().mount()` only needs the first Web
`Request`; use [`createFetchHandler()`](/docs/api/transports/fetch) with `contextInput` when application context must
include Deno's connection metadata.

## Keep Fetch behavior at the shared boundary

The adapter uses Web body and response types on both sides of the Deno handler. A declared request body is read from the
one-shot `Request` body; set `preserveRequestBody` only when code outside the adapter must read the original request
again. The default adapter body limit is unlimited, but Deno, a proxy, or a deployment service can reject a request
before the handler runs.

Declared streams become Web `ReadableStream` bodies. The adapter passes `request.signal` to portable server code and
calls a stream producer's `return()` when the response is cancelled. See [adapter behavior](./adapter-conformance.md)
for body ownership, finite `maxBodyBytes`, error phases, raw responses, streaming, and cancellation.

## Next steps

- [Server context and middleware](./server-context.md) explains portable request context and route policies.
- [Server fragments and composition](./server-composition.md) shows how to mount selected route groups.
- [Typed clients](./client-authoring.md) calls the deployed Deno endpoint through the same contract.
