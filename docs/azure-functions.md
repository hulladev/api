# Azure Functions

`@hulla/api-azure-functions` mounts an `@hulla/api` server implementation as an Azure Functions Node.js v4 HTTP handler. Register
the handler on a catch-all HTTP trigger owned by the function application:

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

## Register the HTTP trigger

```ts
import { app } from '@azure/functions'
import { azureFunctionsAdapter } from '@hulla/api-azure-functions'
import { implementation } from './api/server'

const adapter = azureFunctionsAdapter()

app.http('api', {
  authLevel: 'anonymous',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  route: '{*path}',
  handler: adapter.mount(implementation),
})
```

Azure's `routePrefix` remains part of `HttpRequest.url`. With the default `api` prefix, an `@hulla/api` contract whose
`basePath` is `/api` matches the example directly. Change `host.json` or the contract base path when the application uses
a different prefix.

The adapter reads Azure's native URL, query, headers, and body helpers directly. It returns `HttpResponseInit`, uses
`jsonBody` for JSON, and passes byte streams through as `AsyncIterable<Uint8Array>` without constructing a Web Fetch
`Request` or `Response`.

## Client consumption

The Functions adapter only hosts the server implementation. Browser, mobile, and service consumers use the ordinary
contract-shaped client against the function application's public origin:

```ts
import { defineClient } from '@hulla/api/client'
import { fetchTransport } from '@hulla/api/fetch'
import { contract } from './api/contract'

export const api = defineClient(contract, {
  transport: fetchTransport({ baseUrl: 'https://example.azurewebsites.net' }),
})

export async function getUser(id: string) {
  const result = await api.users.byId({ params: { id } })

  if (result.status === 200) return result.body
  if (result.status === 404) return undefined
  throw new Error(`Could not load user: ${result.status}`)
}
```

`baseUrl` is placed before the contract's `basePath`; do not repeat Azure's `routePrefix` when that prefix is already in
the contract. The returned value is a status-discriminated union, so each declared response narrows its body and
headers. Use the resulting function inside the consumer's own state or query library; see
[client authoring](./client-authoring.md) and [client integrations](./plugins.md).

## Native context

Use the adapter object's `context()` method for invocation logging, tracing, authentication data, or secondary bindings:

```ts
import { defineServer } from '@hulla/api/server'
import { azureFunctionsAdapter } from '@hulla/api-azure-functions'

const adapter = azureFunctionsAdapter()
const server = defineServer(contract, {
  context: adapter.context(({ request, invocationContext, route }) => ({
    invocationId: invocationContext.invocationId,
    user: request.user,
    log: invocationContext.log,
    route,
  })),
})
```

An adapter-native context factory binds every implementation and fragment from that server definition to the Azure
Functions adapter. Portable context factories that only consume `route` remain deployable through any compatible
adapter.

Pass `onError` to `mount()` to observe transport and server failures or replace the default native response:

```ts
const handler = adapter.mount(implementation, {
  onError({ error, phase, request, invocationContext, defaultResponse }) {
    invocationContext.error(phase, request.url, error)
    return defaultResponse
  },
})
```

## Scope

The adapter targets HTTP triggers in the Azure Functions Node.js v4 programming model. Timer, queue, blob, Event Hub,
and other triggers are application events rather than `@hulla/api` HTTP requests and do not use this adapter. The adapter
returns a handler but does not call `app.http()` itself, leaving authorization, methods, route prefixes, extra bindings,
and function naming under application control.
