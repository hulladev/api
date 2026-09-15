# Netlify Functions

`@hulla/api-netlify-functions` mounts an `@hulla/api` server implementation as a modern Web-native Netlify Function.
The adapter accepts Netlify's `Request` and `Context` directly and returns a Web `Response`.

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

## Create the function

```ts
// netlify/functions/api.ts
import type { Config } from '@netlify/functions'
import { netlifyFunctionsAdapter } from '@hulla/api-netlify-functions'
import { implementation } from '../../src/api/server'

const adapter = netlifyFunctionsAdapter()

export default adapter.mount(implementation)

export const config: Config = {
  path: '/api/*',
}
```

Without a custom `path`, Netlify exposes the file at `/.netlify/functions/api`. The example assigns `/api/*` to the
function so a contract with the `/api` base path receives URLs such as `/api/health` unchanged. Keep host routing and
the contract base path aligned; the adapter does not strip or invent prefixes.

The handler delegates to the shared Fetch executor without translating the native request or response. JSON, text,
bytes, form data, raw Web responses, and streamed Web responses therefore retain the Fetch adapter's behavior.

## Client consumption

The Netlify adapter only hosts the server implementation. Browser, mobile, and service consumers use the ordinary
contract-shaped client against the site or function origin:

```ts
import { createClient } from '@hulla/api/client'
import { fetchTransport } from '@hulla/api/fetch'
import { contract } from './api/contract'

export const api = createClient(contract, {
  transport: fetchTransport({ baseUrl: 'https://example.netlify.app' }),
})

export async function getUser(id: string) {
  const result = await api.users.byId({ params: { id } })

  if (result.status === 200) return result.body
  if (result.status === 404) return undefined
  throw new Error(`Could not load user: ${result.status}`)
}
```

`baseUrl` is placed before the contract's `basePath`. The returned value is a status-discriminated union, so each
declared response narrows its body and headers. See [client authoring](./client-authoring.md) and
[client integrations](./plugins.md).

## Native context

Use the adapter object's `context()` method for Netlify request metadata, geo information, cookies, route parameters,
or deferred work:

```ts
import { defineServer } from '@hulla/api/server'
import { netlifyFunctionsAdapter } from '@hulla/api-netlify-functions'

const adapter = netlifyFunctionsAdapter()
const server = defineServer(contract, {
  context: adapter.context(({ request, netlifyContext, route }) => {
    netlifyContext.waitUntil(writeAuditLog(netlifyContext.requestId))

    return {
      request,
      requestId: netlifyContext.requestId,
      country: netlifyContext.geo.country?.code,
      route,
    }
  }),
})
```

`request` is the same Web `Request` passed to the function. `netlifyContext` is Netlify's native `Context`, including
`params`, `cookies`, `geo`, `ip`, site and deploy metadata, `requestId`, and `waitUntil()`. An adapter-native context
factory binds every implementation and fragment from that server definition to this adapter.

Pass `onError` to the adapter or one `mount()` call to observe failures or return a replacement Web response:

```ts
const handler = adapter.mount(implementation, {
  onError({ error, phase, netlifyContext, defaultResponse }) {
    console.error(phase, netlifyContext.requestId, error)
    return defaultResponse
  },
})
```

## Scope

The adapter targets Netlify's
[Web-native synchronous function handler](https://docs.netlify.com/build/functions/api/). Scheduled functions,
background functions, event-triggered functions, and platform-specific event handlers have distinct invocation and
response lifecycles and do not use this adapter. Function paths, supported methods, deployment configuration, and
authorization remain under application and Netlify configuration control.

