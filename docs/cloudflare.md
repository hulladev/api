# Cloudflare Workers

`@hulla/api-cloudflare` connects your API to a Worker's `fetch()` entrypoint. Mount the implementation there to handle HTTP requests and access bindings such as KV from your handlers.

## Install the adapter

This guide assumes the Worker project and its Wrangler configuration already exist. The example uses Zod for request
and response schemas.

<!-- docs:package-manager -->

```sh
# Bun
bun add @hulla/api @hulla/api-cloudflare zod

# npm
npm install @hulla/api @hulla/api-cloudflare zod

# pnpm
pnpm add @hulla/api @hulla/api-cloudflare zod

# Yarn
yarn add @hulla/api @hulla/api-cloudflare zod
```

## Mount a route and verify it

Declare the HTTP boundary in a module shared by server and client code:

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
          z.object({ id: z.string(), runtime: z.string() })
        ),
      },
    }),
  },
})
```

Implement the route in server-only code:

```ts
// src/api/server.ts
import { defineServer } from '@hulla/api/server'
import { contract } from './contract'

export const implementation = defineServer(contract).implement({
  profile: ({ params, response }) =>
    response(200, {
      id: params.id,
      runtime: 'cloudflare-worker',
    }),
})
```

Mount the implementation as the Module Worker's `fetch` handler:

```ts
// src/index.ts
import { cloudflareAdapter } from '@hulla/api-cloudflare'
import { implementation } from './api/server'

export default {
  fetch: cloudflareAdapter().mount(implementation),
}
```

The mounted function has the same `(request, env, ctx)` shape that Cloudflare calls. Verify the adapter boundary
without deploying or opening a port:

```ts
// scripts/verify-worker.ts
import worker from '../src/index'

const result = await worker.fetch(
  new Request('https://worker.example/api/profiles/user%201'),
  {},
  {
    waitUntil() {},
    passThroughOnException() {},
  }
)

console.log(result.status) // 200
console.log(await result.json())
// { id: 'user 1', runtime: 'cloudflare-worker' }
```

The call uses an ordinary Web `Request` and receives an ordinary Web `Response`. In production, Cloudflare supplies
the real bindings and execution context to that same mounted function.

## Follow the Worker request lifecycle

For each HTTP request:

1. Cloudflare calls the exported `fetch` handler with `request`, `env`, and `ctx`.
2. The adapter matches the method and pathname against the selected contract routes.
3. It decodes and validates declared path parameters, query values, headers, and any request body.
4. `@hulla/api` creates server context, runs server middleware, and calls the handler.
5. The adapter returns the declared result as a Web `Response`.

An unmatched path returns `404`; a known path with the wrong method returns `405` with an `Allow` header. Mounting a
[server fragment](./server-composition.md) limits matching to that fragment's routes. The adapter does not add Worker
routes or Wrangler configuration around the mounted handler.

## Add bindings to server context

Run `wrangler types` in the Worker project when application context needs generated binding and runtime types:

```sh
wrangler types
```

Pass the generated `Env` type to `cloudflareAdapter()`, then use `adapter.context()` to expose only the native values
needed by handlers:

```ts
// src/index.ts
import { defineServer } from '@hulla/api/server'
import { cloudflareAdapter } from '@hulla/api-cloudflare'
import { contract } from './api/contract'

type Env = {
  SERVICE_NAME: string
}

const adapter = cloudflareAdapter<Env>()

const implementation = defineServer(contract, {
  context: adapter.context(({ env, ctx, request, route }) => ({
    defer: ctx.waitUntil.bind(ctx),
    requestId: request.headers.get('cf-ray'),
    routeKey: route.key.join('.'),
    serviceName: env.SERVICE_NAME,
  })),
}).implement({
  profile: ({ params, context, response }) => {
    console.info(context.requestId, context.routeKey)
    return response(200, {
      id: params.id,
      runtime: context.serviceName,
    })
  },
})

export default {
  fetch: adapter.mount(implementation),
}
```

The adapter's built-in execution-context type includes `waitUntil()` and `passThroughOnException()`. When code needs
additional properties from Wrangler's generated `ExecutionContext`, pass that type as the second generic argument:

```ts
const adapter = cloudflareAdapter<Env, ExecutionContext>()
```

`adapter.context()` binds the implementation to the `cloudflare-workers` adapter. Mounting it through Pages, generic
Fetch, or the in-process transport fails during setup rather than supplying incompatible native state.

## Keep request-body ownership explicit

The adapter reads a contract-declared body from the Web `Request` before creating context or calling the handler. Read
the decoded value from the handler's typed `body` field. For a body route, the native `request` visible to a context
factory has already been consumed.

The Cloudflare adapter does not expose `preserveRequestBody` or `maxBodyBytes`. If outer Worker code also needs the
body, clone the request before passing the original to the mounted handler. Cloudflare's request limits still apply at
the platform boundary.

## Handle errors, streams, and cancellation

Use `onError` to observe or replace failures while the adapter decodes inputs, creates context, runs server middleware
or the handler, serializes a response, or converts it to a Web `Response`:

```ts
const adapter = cloudflareAdapter<Env>({
  onError({ error, phase, request, env, ctx, defaultResponse }) {
    console.error(phase, request.url, env.SERVICE_NAME, ctx, error)
    return defaultResponse
  },
})
```

The hook receives the invocation's `env` and `ctx` plus a clone of the protocol-safe default `Response`. Return another
`Response` to replace it, or return `undefined` to keep the default. Options passed to `mount()` override adapter
defaults; `onError: undefined` disables an inherited hook for that mount.

Declared streams become Web `ReadableStream` bodies. Cancelling the response stream calls the source iterator's
`return()` method, and a producer failure is reported with `phase: 'transport'`. Once the response has been returned,
the hook can observe a late stream failure but cannot replace bytes already in flight. The handler's `signal` is the
incoming `Request.signal`; pass it to work that supports cooperative cancellation.

## Keep non-HTTP events outside this adapter

The package root targets the Module Worker `fetch(request, env, ctx)` handler. It does not implement legacy Service
Worker event syntax or Cloudflare's scheduled, queue, email, alarm, or Durable Object lifecycles. Those entrypoints do
not represent an `@hulla/api` HTTP request and should call application services directly.

D1, KV, R2, service bindings, and Durable Object namespaces need no adapter-specific API. Configure them in the
Worker project, include them in `Env`, and expose the values handlers need through server context.

## Next steps

- [Server context and middleware](./server-context.md) explains portable request context and route policies.
- [Server fragments and composition](./server-composition.md) shows how to mount selected route groups.
- [Typed clients](./client-authoring.md) calls the deployed Worker through the same contract.
- [Cloudflare's fetch-handler documentation](https://developers.cloudflare.com/workers/runtime-apis/handlers/fetch/)
  covers bindings, execution context, and deployment behavior.
