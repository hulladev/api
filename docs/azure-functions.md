# Azure Functions

`@hulla/api-azure-functions` turns your implementation into an Azure HTTP handler. Register it with `app.http()` in an Azure Functions Node.js v4 project.

## Install the adapter

This guide assumes an Azure Functions v4 project already exists. The example uses Zod for its request and response
schemas.

<!-- docs:package-manager -->

```sh
# Bun
bun add @hulla/api @hulla/api-azure-functions @azure/functions zod

# npm
npm install @hulla/api @hulla/api-azure-functions @azure/functions zod

# pnpm
pnpm add @hulla/api @hulla/api-azure-functions @azure/functions zod

# Yarn
yarn add @hulla/api @hulla/api-azure-functions @azure/functions zod
```

## Mount a route and invoke the handler

Declare the HTTP path shared by server and client code. The contract includes `/api` because Azure's default route
prefix remains in the URL received by the handler:

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

Implement the route and register the mounted handler. `app.http()` returns `void`, so export the handler itself when
another module needs to invoke the adapter boundary directly:

```ts
// src/functions/api.ts
import { app } from '@azure/functions'
import { azureFunctionsAdapter } from '@hulla/api-azure-functions'
import { defineServer } from '@hulla/api/server'
import { contract } from '../api/contract'

const implementation = defineServer(contract).implement({
  profile: ({ params, response }) =>
    response(200, {
      id: params.id,
      runtime: 'azure-functions',
    }),
})

export const handler = azureFunctionsAdapter().mount(implementation)

app.http('api', {
  authLevel: 'anonymous',
  methods: ['GET'],
  route: '{*path}',
  handler,
})
```

The catch-all trigger lets one function serve every route in the contract. List every HTTP method used by the contract
in `methods`; Azure rejects an unlisted method before the request reaches `@hulla/api`.

Invoke the exported handler with Azure's own request and invocation types to verify the integration without deploying:

```ts
// scripts/verify-azure.ts
import { HttpRequest, InvocationContext } from '@azure/functions'
import { handler } from '../src/functions/api'

const result = await handler(
  new HttpRequest({
    method: 'GET',
    url: 'https://example.azurewebsites.net/api/profiles/user-1',
  }),
  new InvocationContext({
    functionName: 'api',
    invocationId: 'local-1',
  })
)

console.log(result)
// {
//   status: 200,
//   headers: { 'content-type': 'application/json' },
//   jsonBody: { id: 'user-1', runtime: 'azure-functions' }
// }
```

The handler returns `HttpResponseInit | HttpResponse`, not a Web `Response`. Azure turns that native value into the
public HTTP response.

## Follow the request-to-response lifecycle

For each invocation:

1. The Azure host selects a function using its route, allowed methods, and authorization settings.
2. Azure calls the registered handler with `HttpRequest` and `InvocationContext` values.
3. The adapter reads the method and full URL pathname, then matches a route in the contract.
4. It decodes and validates the declared query, headers, and body before running context, middleware, and the route
   handler.
5. It validates the declared result and translates it to `HttpResponseInit | HttpResponse`.

An unmatched contract path returns `404`; a known path with the wrong method returns `405` only when Azure's trigger
allows that method through. Trigger routing and authorization failures happen before the adapter runs.

## Match `routePrefix` to the contract

Azure prefixes HTTP trigger routes with `api` by default. That prefix is present in `HttpRequest.url`, so it must also
be present in the path matched by the contract.

| `host.json` route prefix | Trigger route | Public path | Matching contract path |
| --- | --- | --- | --- |
| `api` (default) | `{*path}` | `/api/profiles/user-1` | `/api/profiles/:id` |
| `""` | `{*path}` | `/profiles/user-1` | `/profiles/:id` |

Configure a different prefix with `extensions.http.routePrefix` in `host.json`, then make the contract `basePath`
match the pathname Azure passes to the handler. Microsoft documents this host setting in [Customize an HTTP
endpoint](https://learn.microsoft.com/en-us/azure/azure-functions/functions-bindings-http-webhook-trigger#customize-the-http-endpoint).

> Do not add the host prefix twice. With the default Azure prefix and a contract `basePath` of `/api`, the client calls
> `https://example.azurewebsites.net/api/...`; it does not add another `/api` outside the contract path.

## Add invocation state to server context

Use `adapter.context()` when handlers need Azure's invocation ID, logger, authenticated user, or another value from the
native request. Define the context and mount the implementation through the same adapter:

```ts
// src/functions/api.ts
import { app } from '@azure/functions'
import { azureFunctionsAdapter } from '@hulla/api-azure-functions'
import { defineServer } from '@hulla/api/server'
import { contract } from '../api/contract'

const adapter = azureFunctionsAdapter()

const implementation = defineServer(contract, {
  context: adapter.context(({ request, invocationContext, route }) => ({
    invocationId: invocationContext.invocationId,
    user: request.user,
    routeKey: route.key.join('.'),
  })),
}).implement({
  profile: ({ params, context, response }) => {
    console.info(context.invocationId, context.routeKey, context.user)
    return response(200, {
      id: params.id,
      runtime: 'azure-functions',
    })
  },
})

export const handler = adapter.mount(implementation)

app.http('api', {
  authLevel: 'anonymous',
  methods: ['GET'],
  route: '{*path}',
  handler,
})
```

An adapter-native context binds the implementation to the Azure Functions adapter. Mounting it through another
adapter fails during setup rather than supplying incompatible native state.

This adapter does not receive a client-disconnect signal from the Azure handler. The portable `signal` therefore does
not abort when the caller disconnects; application work that needs cancellation must use an Azure-appropriate policy.

## Know how bodies and responses cross the boundary

The adapter reads request bodies through the methods on Azure's `HttpRequest`. The declaration's content type selects
the corresponding representation before validation.

| Contract representation | Azure Functions adapter behavior |
| --- | --- |
| Empty | Returns status and headers without a body. |
| JSON | Reads `request.json()` and returns JSON with `jsonBody`. |
| Text | Reads `request.text()` and returns a string in `body`. |
| Bytes | Reads `request.arrayBuffer()` and returns `Uint8Array` in `body`. |
| Form data | Reads `request.formData()` and returns `FormData` in `body`. |
| Stream response | Returns `AsyncIterable<Uint8Array>` in `body` without collecting its chunks in the adapter. |
| Raw response | Passes through an Azure-native response only when its `status` matches the declared contract status. |

There is no stream or raw request-body representation, and the adapter does not expose a body-size option. Azure host
and platform limits apply before or around the handler.

Returning an async iterable is only one half of HTTP streaming. Enable streaming before registering functions when the
deployed host must send chunks incrementally:

```ts
import { app } from '@azure/functions'

app.setup({ enableHttpStream: true })
```

Azure HTTP streaming requires the Node.js v4 programming model and compatible Functions host, Core Tools, and
`@azure/functions` versions. Check Microsoft's current [HTTP streaming requirements](https://learn.microsoft.com/en-us/azure/azure-functions/node-http-stream)
before relying on incremental delivery. A failure produced while a stream is being consumed happens after the handler
has returned and is not handled by the mount-level `onError` hook.

## Observe or replace adapter failures

Pass `onError` to `mount()` to record failures with both the request and invocation state:

```ts
// src/functions/api.ts
export const handler = adapter.mount(implementation, {
  onError({ error, phase, request, invocationContext, defaultResponse }) {
    invocationContext.error({
      error,
      phase,
      requestUrl: request.url,
      invocationId: invocationContext.invocationId,
    })
    return defaultResponse
  },
})
```

The hook receives the protocol-safe default Azure response. Return it or `undefined` to keep the fallback, or return
another `HttpResponseInit | HttpResponse` with a numeric `status` to replace it. If the hook throws or returns an
invalid replacement, the adapter keeps the default response without invoking the hook again.

Use declared contract responses for expected application outcomes. `onError` is for failures while matching routes,
decoding or validating inputs, creating context, running middleware or handlers, validating outputs, or translating the
Azure response.

## Keep non-HTTP triggers outside this adapter

Timer, queue, blob, Event Hub, and other triggers are application events rather than `@hulla/api` HTTP requests. Call
the underlying application service directly from those functions instead of passing their payloads to this adapter.

The adapter returns an HTTP handler. It does not create the function app, select a Node.js runtime, register the
trigger, configure authorization or bindings, change `host.json`, or deploy infrastructure.

## Next steps

- [Server context and middleware](./server-context.md) explains portable request context and route policies.
- [Server fragments and composition](./server-composition.md) shows how to mount selected route groups.
- [Typed clients](./client-authoring.md) calls the deployed function through the same contract.
- [Adapter behavior](./adapter-conformance.md) compares body ownership, streaming, routing, and cancellation across
  hosts.
