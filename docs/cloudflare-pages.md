# Cloudflare Pages Functions

Serve your API from a file-routed Pages Function with `@hulla/api-cloudflare/pages`. The example adds a catch-all function to an existing Pages project.

For a new project or Pages Advanced Mode, use the [Workers setup](./cloudflare.md).

## Install the adapter

This guide assumes the Pages project and its local or dashboard configuration already exist. The example uses Zod for
request and response schemas.

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

## Mount a catch-all API function

Declare the HTTP boundary in code shared by the Pages Function and any clients:

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
      runtime: 'cloudflare-pages',
    }),
})
```

Pages Functions use file-based routing. Because the contract begins at `/api`, mount it in a catch-all function below
that same prefix:

```ts
// functions/api/[[hulla]].ts
import { cloudflarePagesAdapter } from '@hulla/api-cloudflare/pages'
import { implementation } from '../../src/api/server'

export const onRequest = cloudflarePagesAdapter().mount(implementation)
```

The double-bracket file route receives every path below `/api`. Its `hulla` parameter is an array of the captured path
segments, but contract matching still uses `context.request.url`.

Verify the mounted function directly before testing Pages routing or deployment:

```ts
// scripts/verify-pages.ts
import { onRequest } from '../functions/api/[[hulla]]'

const result = await onRequest({
  request: new Request('https://pages.example/api/profiles/user%201'),
  functionPath: '/api/[[hulla]]',
  waitUntil() {},
  passThroughOnException() {},
  next: async () => new Response('next'),
  env: { ASSETS: { fetch } },
  params: { hulla: ['profiles', 'user%201'] },
  data: {},
})

console.log(result.status) // 200
console.log(await result.json())
// { id: 'user 1', runtime: 'cloudflare-pages' }
```

This calls the same `onRequest(context)` function that Pages invokes. It verifies contract matching and response
encoding in process; use the project's Pages development command to verify Cloudflare's file routing and bindings.

## Separate Pages routing from contract routing

Pages first decides whether `functions/api/[[hulla]].ts` should run. Once a request reaches that file, the adapter owns
the API boundary:

1. The adapter matches the request method and URL pathname against the selected contract routes.
2. It decodes and validates declared inputs, creates server context, runs server middleware, and calls the handler.
3. It returns the declared result as a Web `Response`.

> A contract route miss inside this catch-all returns the adapter's `route-not-found` response with status `404`. The
> adapter does not call `context.next()` or `env.ASSETS.fetch()` automatically.

Requests that do not match the Pages file route remain subject to Pages' static-asset and `_routes.json` behavior. Keep
the function under the contract's `basePath` so unrelated site paths do not enter the API catch-all. See
[Cloudflare's Pages routing guide](https://developers.cloudflare.com/pages/functions/routing/) for file precedence,
dynamic parameters, and asset routing.

## Add Pages state to server context

Run Wrangler's Pages type generator when context needs project bindings and runtime types:

```sh
wrangler types --path='./functions/types.d.ts'
```

The adapter's generic parameters describe `Env`, the union of file-route parameter names, and middleware-populated
`data`:

```ts
// functions/api/[[hulla]].ts
import { defineServer } from '@hulla/api/server'
import { cloudflarePagesAdapter } from '@hulla/api-cloudflare/pages'
import { contract } from '../../src/api/contract'

type Env = {
  SERVICE_NAME: string
}

type PagesData = {
  actor?: { readonly id: string }
}

const adapter = cloudflarePagesAdapter<Env, 'hulla', PagesData>()

const implementation = defineServer(contract, {
  context: adapter.context(
    ({ data, env, functionPath, params, request, route, waitUntil }) => ({
      actor: data.actor,
      defer: waitUntil,
      functionPath,
      pagesPath: params.hulla,
      requestId: request.headers.get('cf-ray'),
      routeKey: route.key.join('.'),
      serviceName: env.SERVICE_NAME,
    })
  ),
}).implement({
  profile: ({ params, context, response }) => {
    console.info(context.actor, context.functionPath, context.pagesPath)
    return response(200, {
      id: params.id,
      runtime: context.serviceName,
    })
  },
})

export const onRequest = adapter.mount(implementation)
```

A single-bracket Pages parameter is a string; a double-bracket catch-all is a string array. The third generic types
`context.data`, which Pages middleware can populate before the mounted function runs. Native context also includes
`next()`, `passThroughOnException()`, and `env.ASSETS.fetch()`.

`adapter.context()` binds the implementation to the `cloudflare-pages` adapter. Mounting it through a Module Worker,
generic Fetch, or the in-process transport fails during setup rather than supplying incompatible native state.

## Keep request-body ownership explicit

The adapter reads a contract-declared body from `context.request` before creating server context or calling the
handler. Read the decoded value from the handler's typed `body` field. For a body route, the native request visible to
a context factory has already been consumed.

The Pages adapter does not expose `preserveRequestBody` or `maxBodyBytes`. Pages middleware that also needs the body
must clone the request before the mounted function reads it. Cloudflare's request limits remain platform-owned.

## Handle errors, streams, and cancellation

Use `onError` to observe or replace failures inside the adapter boundary:

```ts
const adapter = cloudflarePagesAdapter<Env, 'hulla', PagesData>({
  onError({ data, defaultResponse, env, error, functionPath, phase, request }) {
    console.error(phase, functionPath, request.url, env.SERVICE_NAME, data, error)
    return defaultResponse
  },
})
```

The hook receives the complete Pages event context and a clone of the protocol-safe default `Response`. Return another
`Response` to replace it, or return `undefined` to keep the default. Options passed to `mount()` override adapter
defaults; `onError: undefined` disables an inherited hook for that mount.

Declared streams become Web `ReadableStream` bodies. Cancelling the response stream calls the source iterator's
`return()` method, and a producer failure is reported with `phase: 'transport'`. Once the response has been returned,
the hook can observe a late stream failure but cannot replace bytes already in flight. The handler's `signal` is
`context.request.signal`.

## Use the Worker adapter in Advanced Mode

Pages Advanced Mode uses a `_worker.js` Module Worker and ignores the `functions/` directory's file routing and
middleware. Use the [Cloudflare Workers adapter](./cloudflare.md) there, and explicitly forward non-API requests to
`env.ASSETS.fetch()` as required by the Pages project. See
[Cloudflare's Advanced Mode guide](https://developers.cloudflare.com/pages/functions/advanced-mode/) for the asset
fallback boundary.

## Next steps

- [Server context and middleware](./server-context.md) explains portable request context and route policies.
- [Server fragments and composition](./server-composition.md) shows how to mount selected route groups.
- [Typed clients](./client-authoring.md) calls the deployed Pages Function through the same contract.
- [Cloudflare's Pages Functions documentation](https://developers.cloudflare.com/pages/functions/) covers file
  routing, bindings, middleware, and deployment.
