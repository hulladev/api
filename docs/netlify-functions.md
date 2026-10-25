# Netlify Functions

`@hulla/api-netlify-functions` turns your implementation into a Netlify function. Export it from a function file, then configure the public path that serves your API.

## Install the adapter

Use Node.js 22 or later and `@netlify/functions` 4.x or 5.x. This adapter targets web request functions that return a response. Background, scheduled, and platform event functions use different handlers.

This guide assumes a Netlify project already exists. The example uses Zod for its request and response schemas.

<!-- docs:package-manager -->

```sh
# Bun
bun add @hulla/api @hulla/api-netlify-functions @netlify/functions zod

# npm
npm install @hulla/api @hulla/api-netlify-functions @netlify/functions zod

# pnpm
pnpm add @hulla/api @hulla/api-netlify-functions @netlify/functions zod

# Yarn
yarn add @hulla/api @hulla/api-netlify-functions @netlify/functions zod
```

## Mount one route

The example serves `GET /api/profiles/:id`. Declare that path in a module shared by server and client code:

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
            runtime: z.literal('netlify-functions'),
          })
        ),
      },
    }),
  },
})
```

Implement the route in server-only code. Export the adapter with the implementation so later native-context changes do
not require a second adapter setup:

```ts
// src/api/server.ts
import { netlifyFunctionsAdapter } from '@hulla/api-netlify-functions'
import { defineServer } from '@hulla/api/server'
import { contract } from './contract'

export const adapter = netlifyFunctionsAdapter()

export const implementation = defineServer(contract).implement({
  profile: ({ params, response }) =>
    response(200, {
      id: params.id,
      runtime: 'netlify-functions',
    }),
})
```

Netlify discovers functions in `netlify/functions` by default. Mount the implementation from an `.mts` entrypoint and
assign the function a public path:

```ts
// netlify/functions/api.mts
import type { Config } from '@netlify/functions'
import { adapter, implementation } from '../../src/api/server'

export default adapter.mount(implementation)

export const config: Config = {
  path: '/api/*',
}
```

`mount()` returns Netlify's `(request, context) => Promise<Response>` handler. The adapter receives the full pathname;
it does not remove `/api` before matching the contract.

### Verify the Netlify boundary

Start [Netlify Dev](https://docs.netlify.com/api-and-cli-guides/cli-guides/manage-functions/) from the project root:

```sh
netlify dev
```

Call the route through the local Netlify server:

```sh
curl --include http://localhost:8888/api/profiles/user-1
```

The response shows that Netlify selected the function and the adapter selected the contract route:

```text
HTTP/1.1 200 OK
content-type: application/json

{"id":"user-1","runtime":"netlify-functions"}
```

Port `8888` is Netlify Dev's default; use the port printed by the CLI when the project overrides it.

## Align Netlify routing with the contract

> Netlify selects the function first. Only then can `@hulla/api` select a route from the contract.

The host path and contract path describe the same public URL at different layers:

| Layer                 | Value                  | What it does                                              |
| --------------------- | ---------------------- | --------------------------------------------------------- |
| Netlify function path | `/api/*`               | Decides whether Netlify invokes this function.            |
| Contract `basePath`   | `/api`                 | Starts the pathname matched by the adapter.               |
| Contract route        | `/profiles/:id`        | Matches the remainder and decodes `id`.                   |
| Complete request path | `/api/profiles/user-1` | Passes both selections and reaches the `profile` handler. |

Without `config.path`, a file named `api.mts` is available at `/.netlify/functions/api`. Setting `path: '/api/*'`
replaces that default URL; it does not create an alias. Netlify documents wildcards, named parameters, exclusions, and
static-file precedence in [function routing](https://docs.netlify.com/build/functions/configuration/#routing).

Netlify path parameters and contract path parameters are independent. A named parameter in `config.path` appears in
`netlifyContext.params`; `:id` from the contract appears in the route handler's `params`. The adapter does not merge
them.

`config.method` is another host-level gate. When it blocks a method, Netlify does not invoke the function, so the
adapter cannot return its `405` response. Omit that gate when one catch-all function serves several contract methods
and the contract should own method matching. If Netlify invokes the function but the contract has no matching path or
method, the adapter returns its normal `404` or `405` problem response.

## Follow the request lifecycle

For each web request:

1. Netlify checks `config.path` and, when present, `config.method` before invoking the function.
2. Netlify passes the original Web `Request` and native `Context` to the mounted handler.
3. The adapter matches the request method and full pathname against the contract.
4. `@hulla/api` decodes and validates declared parameters, query values, headers, and body.
5. It creates server context, runs middleware, and calls the matched route handler with `request.signal` as the portable
   handler `signal`.
6. It validates the declared result and creates a Web `Response`.
7. Netlify sends that response to the caller.

Host routing, access control, or static-file selection can stop a request before this lifecycle. Once the handler is
running, contract routing and validation determine the response.

## Add Netlify state to server context

Use `adapter.context()` when handlers need a request ID, geo metadata, cookies, deployment information, or other
Netlify state. Replace the server definition above with an adapter-bound context factory:

```ts
// src/api/server.ts
import { netlifyFunctionsAdapter } from '@hulla/api-netlify-functions'
import { defineServer } from '@hulla/api/server'
import { contract } from './contract'

export const adapter = netlifyFunctionsAdapter()

export const implementation = defineServer(contract, {
  context: adapter.context(({ request, netlifyContext, route }) => ({
    country: netlifyContext.geo.country?.code ?? 'unknown',
    method: request.method,
    requestId: netlifyContext.requestId,
    routeKey: route.key.join('.'),
  })),
}).implement({
  profile: ({ context, params, response }) => {
    console.info({
      country: context.country,
      method: context.method,
      requestId: context.requestId,
      route: context.routeKey,
    })

    return response(200, {
      id: params.id,
      runtime: 'netlify-functions',
    })
  },
})
```

The native context input contains exactly two host values:

| Value            | Meaning                                                                                |
| ---------------- | -------------------------------------------------------------------------------------- |
| `request`        | The same Web `Request` passed to the function and used for contract routing and input. |
| `netlifyContext` | Netlify's native `Context`, including request, geo, cookie, site, and deploy metadata. |

`netlifyContext.waitUntil(promise)` keeps the invocation alive for deferred work such as emitting analytics without
delaying the response. That work still counts toward Netlify's execution time. See Netlify's
[`Context` reference](https://docs.netlify.com/build/functions/api/#context-object) for the current fields and
`waitUntil()` behavior.

An adapter-native context binds the implementation to `netlify-functions`. Mounting that implementation through a
different adapter fails during setup instead of supplying incompatible native state.

### Keep request-body ownership explicit

For a route with a declared body, the adapter reads that body before it creates server context. JSON uses
`request.json()`, text uses `request.text()`, bytes use `request.arrayBuffer()`, and form data uses
`request.formData()`. Because Web request bodies are one-shot streams, the same `request` exposed to the context
factory has already been consumed for that route.

Read the decoded `body` argument in the handler instead of reading `request` again. The Netlify adapter has no
`preserveRequestBody` option. Code at the outer Netlify boundary that genuinely needs the raw body must clone the
incoming request before calling the mounted handler, then read the clone without consuming the request passed to the
adapter.

## Understand responses and streams

The adapter uses Web response types at the Netlify boundary:

| Declared response | Adapter behavior                                                                                        |
| ----------------- | ------------------------------------------------------------------------------------------------------- |
| Empty             | Returns the declared status and headers without a body.                                                 |
| JSON              | Serializes the declared value as JSON.                                                                  |
| Text              | Writes the declared string.                                                                             |
| Bytes             | Writes the declared `Uint8Array`.                                                                       |
| Form data         | Writes the declared `FormData`.                                                                         |
| Raw               | Accepts a Web `Response` only when its status equals the declared contract status.                      |
| Stream            | Converts an `AsyncIterable<Uint8Array>` to a Web `ReadableStream` without collecting the complete body. |

The adapter has no Netlify-specific `maxBodyBytes` option. Netlify and any upstream proxy still enforce their own
request, response, and execution limits; use Netlify's current
[function defaults](https://docs.netlify.com/build/functions/configuration/#default-values) when payload size or
duration affects the design.

When a streamed response is cancelled, the adapter calls `return()` on the source iterator when available. A producer
failure after streaming begins can still reach `onError`, but a replacement response cannot overwrite a response that
Netlify has already started sending. Netlify documents its current `ReadableStream` behavior and limits under
[streaming responses](https://docs.netlify.com/build/functions/api/#streaming-responses).

Pass the handler `signal` to database calls, `fetch()`, or other work that supports cooperative cancellation. It is the
same `AbortSignal` carried by Netlify's incoming `Request`; the adapter does not invent a separate timeout.

## Observe or replace failures

Use `onError` for failures during route selection, input decoding, context creation, handler execution, output
validation, or Web response creation. Expected application outcomes should remain declared contract responses.

A mount-level hook can log the native request ID and keep or replace the fallback:

```ts
// netlify/functions/api.mts
import type { Config } from '@netlify/functions'
import { adapter, implementation } from '../../src/api/server'

export default adapter.mount(implementation, {
  onError({ defaultResponse, error, netlifyContext, phase, request }) {
    console.error({
      error,
      phase,
      requestId: netlifyContext.requestId,
      url: request.url,
    })

    if (phase === 'handler') {
      return new Response('Temporary failure', { status: 503 })
    }

    return defaultResponse
  },
})

export const config: Config = {
  path: '/api/*',
}
```

The hook also receives the matched `route` when one exists. Return a Web `Response` to replace the fallback; return
`undefined` or `void` to keep it. If the hook throws or returns another value, the adapter keeps the fallback response.

Passing `onError` to `netlifyFunctionsAdapter()` sets the default for every mount created from that adapter. Passing a
hook to `mount()` overrides that default for one function. After a streaming response is committed, the hook can only
observe a producer failure.

## Keep non-request lifecycles outside the adapter

> [!WARNING] Keep background work in a separate function
> Netlify returns `202` immediately for a background function and discards its handler's response. Setting `background: true` on this handler would prevent the declared contract result from reaching the caller. Call a shared application service from a separate background function instead.

Scheduled functions and platform event handlers also do not have this request-response contract lifecycle. Keep their
trigger handling separate and call shared application services beneath the API layer. Netlify's
[Functions API](https://docs.netlify.com/build/functions/api/) documents the signatures for web requests and platform
events; its [background functions guide](https://docs.netlify.com/build/functions/background-functions/) covers the
`202` lifecycle.

The adapter does not configure function paths, method filters, static-file precedence, deployment, access controls, or
platform limits. Those remain Netlify and application configuration.

## Next steps

- [Server implementations](./server-authoring.md) explains how to turn a contract into a handler tree.
- [Server context and middleware](./server-context.md) covers portable context and request policies.
- [Typed clients](./client-authoring.md) calls the deployed function through the same contract.
- [Adapter behavior](./adapter-conformance.md) compares routing, bodies, streaming, and cancellation across hosts.
