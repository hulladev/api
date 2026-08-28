# Google Cloud Run functions

`@hulla/api-google-cloud-functions` mounts an `@hulla/api` server implementation as an HTTP function for the Google
Cloud Functions Framework. The same Functions Framework boundary is used by Google Cloud Run functions and the
2nd-generation Cloud Functions deployment model.

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

## Register the HTTP function

```ts
// src/index.ts
import { http } from '@google-cloud/functions-framework'
import { googleCloudFunctionsAdapter } from '@hulla/api-google-cloud-functions'
import { implementation } from './api/server'

const adapter = googleCloudFunctionsAdapter()

export const api = adapter.mount(implementation)

http('api', api)
```

The adapter converts the Functions Framework's Express-compatible request into the Web `Request` used by the shared
Fetch executor, then streams its Web `Response` to the native response with backpressure. The framework's buffered
`rawBody` is used when present, so body-parser transformations do not change the bytes decoded by the contract. `HEAD`
requests execute the corresponding `GET` route and suppress the response body.

The contract's `basePath` must match the path forwarded to the function. A contract with `/api` matches requests such
as `/api/health`; a function mounted behind a gateway or rewritten prefix should use the public path seen in
`googleRequest.originalUrl`.

## Client consumption

The Google adapter only hosts the server implementation. Browser, mobile, and service consumers use the ordinary
contract-shaped client against the function's public origin:

```ts
import { defineClient } from '@hulla/api/client'
import { fetchTransport } from '@hulla/api/fetch'
import { contract } from './api/contract'

export const api = defineClient(contract, {
  transport: fetchTransport({ baseUrl: 'https://api.example.com' }),
}).create()

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

Use the adapter object's `context()` method for Functions Framework metadata or direct access to the native response:

```ts
import { defineServer } from '@hulla/api/server'
import { googleCloudFunctionsAdapter } from '@hulla/api-google-cloud-functions'

const adapter = googleCloudFunctionsAdapter()
const server = defineServer(contract, {
  context: adapter.context(({ request, googleRequest, response, route }) => ({
    webRequest: request,
    executionId: googleRequest.executionId,
    spanId: googleRequest.spanId,
    response,
    route,
  })),
})
```

`request` is the Web `Request` used for routing and contract decoding. `googleRequest` is the native Functions
Framework request and includes additions such as `rawBody`, `executionId`, `spanId`, and `abortController`. `response`
is the native Express-compatible response. An adapter-native context factory binds every implementation and fragment
from that server definition to this adapter.

Pass `onError` to the adapter or one `mount()` call to observe failures or return a replacement Web response:

```ts
const handler = adapter.mount(implementation, {
  onError({ error, phase, googleRequest, defaultResponse }) {
    console.error(phase, googleRequest.executionId, error)
    return defaultResponse
  },
})
```

## Scope

The adapter targets HTTP functions registered through the
[Google Cloud Functions Framework](https://github.com/GoogleCloudPlatform/functions-framework-nodejs). CloudEvents,
Pub/Sub events, storage events, and other event-driven signatures use different lifecycles and do not use this
adapter. Registration, function naming, deployment settings, IAM, ingress, and gateway rewrites remain under
application and platform control.

