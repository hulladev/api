# AWS Lambda

`@hulla/api-aws-lambda` mounts an `@hulla/api` server implementation as an AWS Lambda handler for API Gateway HTTP APIs using
payload format 2.0 or Lambda Function URLs. Both hosts use the same event and result shape.

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

## Lambda handler

```ts
import { awsLambdaAdapter } from '@hulla/api-aws-lambda'
import { implementation } from './api/server'

const adapter = awsLambdaAdapter()

export const handler = adapter.mount(implementation)
```

The adapter dispatches `requestContext.http.method` and `rawPath`, preserves repeated query fields from
`rawQueryString`, joins the event's cookie fields into the request `cookie` header, decodes base64 request bodies, and
produces structured payload-format-2.0 responses. Byte and form-data responses are base64 encoded. Stream responses
are collected and returned as one base64 payload because an ordinary Lambda proxy result is buffered.

## Client consumption

The Lambda adapter only hosts the server implementation. Browser, mobile, and service consumers use the ordinary
contract-shaped client against the API Gateway or Function URL origin:

```ts
import { defineClient } from '@hulla/api/client'
import { fetchTransport } from '@hulla/api/fetch'
import { contract } from './api/contract'

export const api = defineClient(contract, {
  transport: fetchTransport({ baseUrl: 'https://api.example.com' }),
})

export async function getUser(id: string) {
  const result = await api.users.byId({ params: { id } })

  if (result.status === 200) return result.body
  if (result.status === 404) return undefined
  throw new Error(`Could not load user: ${result.status}`)
}
```

`baseUrl` is the deployed origin or custom-domain prefix placed before the contract's `basePath`. The returned value is
a status-discriminated union, so each declared response narrows its body and headers. Use the resulting function inside
the consumer's own state or query library; see [client authoring](./client-authoring.md) and
[client integrations](./plugins.md).

## Native context

Use the same adapter object's `context()` method when application context needs the event, authorizer data, or Lambda
invocation state:

```ts
import { defineServer } from '@hulla/api/server'
import { awsLambdaAdapter } from '@hulla/api-aws-lambda'

const adapter = awsLambdaAdapter()
const server = defineServer(contract, {
  context: adapter.context(({ event, lambdaContext, route }) => ({
    claims: event.requestContext.authorizer,
    invocationId: lambdaContext.awsRequestId,
    remainingTime: lambdaContext.getRemainingTimeInMillis(),
    route,
  })),
})
```

An adapter-native context factory binds every implementation and fragment from that server definition to the AWS
Lambda adapter. Portable context factories that only consume `route` remain deployable through any compatible adapter.

## API mappings and errors

Payload format 2.0's `rawPath` omits a custom-domain API mapping. Supply `pathname` when the public contract includes
that mapping or another deployment prefix:

```ts
const handler = adapter.mount(implementation, {
  pathname: (event) => `/api${event.rawPath}`,
  onError({ error, phase, event, lambdaContext, defaultResponse }) {
    console.error(phase, event.requestContext.requestId, lambdaContext.awsRequestId, error)
    return defaultResponse
  },
})
```

The error hook receives the protocol-safe default Lambda result and may return a replacement result. Native invocation
state is passed directly per call, including during concurrent invocations.

## Scope

The adapter intentionally supports API Gateway HTTP API payload format 2.0 and Lambda Function URLs. REST API payload
format 1.0, Application Load Balancer events, WebSocket events, and non-HTTP triggers have different contracts and are
not accepted. Lambda response streaming also uses a different handler and deployment protocol; this buffered adapter
does not opt a function into it.
