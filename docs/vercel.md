# Vercel Functions

Serve your API as a standalone Vercel Function by exporting a Web `fetch` handler from the root `api/` directory. If you're using Next.js, follow the [App Router setup](./next.md) instead.

## Install the packages

The example assumes an existing Vercel project and uses Zod for its request and response schemas.

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

The example serves `GET /api/profile`. Keep the contract in a module that can also be imported by a client:

```ts
// src/api/contract.ts
import { defineContract, response, route } from '@hulla/api'
import { z } from 'zod'

export const contract = defineContract({
  basePath: '/api',
  routes: {
    profile: route.get('/profile', {
      responses: {
        200: response.json(
          z.object({
            id: z.string(),
            runtime: z.literal('vercel'),
          })
        ),
      },
    }),
  },
})
```

Implement the route in server-only code and mount it with the Fetch adapter:

```ts
// src/api/server.ts
import { fetchAdapter } from '@hulla/api/fetch'
import { defineServer } from '@hulla/api/server'
import { contract } from './contract'

const adapter = fetchAdapter()

const implementation = defineServer(contract).implement({
  profile: ({ response }) =>
    response(200, {
      id: 'profile-1',
      runtime: 'vercel',
    }),
})

export const handler = adapter.mount(implementation)
```

## Create the standalone Function

Vercel turns a TypeScript file in the project's root `api` directory into a Function. Export the Web Standard shape
that Vercel documents:

```ts
// api/profile.ts
import { handler } from '../src/api/server'

export default {
  fetch: handler,
}
```

The file name supplies the host route: `api/profile.ts` is available at `/api/profile`. The adapter then matches that
same pathname against the contract. This guide intentionally gives each endpoint its own Vercel entrypoint; Vercel
routing is not part of `fetchAdapter()`.

## Run and verify locally

With the [Vercel CLI](https://vercel.com/docs/cli) installed, start the local environment from the project root:

```sh
vercel dev
```

Call the Function through its file-derived URL:

```sh
curl --include http://localhost:3000/api/profile
```

The port is usually `3000`; use the URL printed by the CLI when your project config chooses another port. A successful
request returns:

```text
HTTP/1.1 200 OK
content-type: application/json

{"id":"profile-1","runtime":"vercel"}
```

Deploy the same project with the Vercel CLI or a connected Git provider. The deployment process decides the runtime,
region, environment variables, function duration, memory, and request/response limits; the `handler` export does not
configure those settings.

## Understand the two routing layers

For `/api/profile`, the request crosses two independent boundaries:

1. Vercel maps `api/profile.ts` to the public `/api/profile` Function.
2. The Fetch adapter matches `GET /api/profile` against the contract.

Vercel can reject or reroute a request before the Function starts. Once the Function runs, a missing contract path
returns 404 and a known path with a disallowed method returns 405 with an `Allow` header. Keep authentication,
rewrites, redirects, headers, and access policy in Vercel configuration or application code; keep contract route
selection in `@hulla/api`.

## Use Vercel's request context deliberately

The mounted handler receives the Web `Request` that Vercel provides. The portable server `signal` is
`request.signal`, and the adapter-bound native context exposes that same `Request` to `adapter.context()`:

```ts
// src/api/server.ts
import { fetchAdapter } from '@hulla/api/fetch'
import { defineServer } from '@hulla/api/server'
import { contract } from './contract'

const adapter = fetchAdapter()

const implementation = defineServer(contract, {
  context: adapter.context(({ request, route }) => ({
    requestId: request.headers.get('x-request-id') ?? 'unknown',
    routeKey: route.key.join('.'),
  })),
}).implement({
  profile: ({ context, response }) => {
    console.info(context.requestId, context.routeKey)
    return response(200, { id: 'profile-1', runtime: 'vercel' })
  },
})

export const handler = adapter.mount(implementation)
```

`adapter.context()` binds this implementation to the Fetch adapter. Mounting it through a different adapter fails during
setup rather than supplying incompatible native state.

Vercel's `@vercel/functions` package provides Vercel-specific helpers such as `waitUntil`; those helpers remain Vercel
concerns and are not inserted into `@hulla/api` context automatically. If client-disconnect cancellation matters,
Vercel requires Node.js runtime cancellation to be enabled per function with
[`supportsCancellation`](https://vercel.com/docs/functions/functions-api-reference):

```jsonc
// vercel.json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "functions": {
    "api/profile.ts": {
      "supportsCancellation": true,
    },
  },
}
```

Once enabled, the standard `request.signal` is the signal passed to your handlers.

## Keep body, response, and stream ownership explicit

The Web `Request` body is one-shot. The adapter reads a declared JSON, text, bytes, or form-data body before invoking the
route handler. Read the decoded `body` value in the handler; use `preserveRequestBody` only when outer code must read the
original request as well. Vercel can enforce a smaller request limit before the adapter runs, even though the adapter's
default `maxBodyBytes` is unlimited.

Declared JSON, text, bytes, empty, `FormData`, and stream responses become Web `Response` objects. Stream producers must
yield `Uint8Array` chunks; cancellation calls their iterator's `return()` when available. If a producer fails after the
response has started, `onError` can observe the transport failure but cannot replace bytes Vercel has already sent.
See [adapter behavior](./adapter-conformance.md) for the shared Fetch boundary.

## Keep Vercel configuration separate

Use Vercel configuration for host concerns such as runtime selection, regions, memory, duration, environment variables,
headers, and request cancellation. `@hulla/api` does not create deployments, add authentication, or change Vercel's
request and response limits.

The current Vercel docs cover [standalone Web Functions](https://vercel.com/docs/functions/runtimes/node-js),
[local development](https://vercel.com/docs/cli/dev), [project configuration](https://vercel.com/docs/project-configuration),
[request cancellation](https://vercel.com/docs/functions/functions-api-reference), [streaming](https://vercel.com/docs/functions/streaming-functions),
and [platform limits](https://vercel.com/docs/limits). Check those pages when a deployment decision depends on a
plan-specific or runtime-specific limit.

## Next steps

- [Server context and middleware](./server-context.md) explains portable request context and route policies.
- [Server fragments and composition](./server-composition.md) shows how to mount selected route groups.
- [Typed clients](./client-authoring.md) calls the deployed Vercel Function through the same contract.
