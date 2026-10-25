# Server implementations

`defineServer(contract).implement(...)` connects your [contract](./contract-authoring.md) to the code that handles each route. The contract checks the handler inputs and the responses you return.

Here, you'll implement the contract's three routes in `src/api/server.ts`, then call one to check the response.

## Implement every route

Import the existing contract and pass a complete handler tree to `implement()`. The tree follows the contract's keys; it does not repeat URL paths.

```ts
// src/api/server.ts
import { defineServer } from '@hulla/api/server'
import { contract } from './contract'

export const server = defineServer(contract)

export const implementation = server.implement({
  health: ({ response }) => response(200, 'ok'),
  users: {
    byId: ({ params, response }) =>
      params.id === 'ada'
        ? response(200, { id: 'ada', name: 'Ada' })
        : response(404, { message: 'User not found' }),
    rename: async ({ params, body, response }) =>
      response(200, { id: params.id, name: body.name }),
  },
})
```

The contract parses and validates declared request inputs before calling a handler.

| Handler input | What it contains |
| --- | --- |
| `params`, `query`, `headers`, `body` | Decoded application values, present only when the route declares them |
| `context` | The object returned by the server's context factory |
| `signal` | A portable `AbortSignal` for cancellable work |
| `route` | The matched route's literal key, method, and full path |
| `errors` | Declared error factories, when the contract defines errors |
| `response(status, body?, headers?)` | A result checked against that route's declared status, body, and headers |

The selected status determines which response body and headers TypeScript accepts. A handler may return only the statuses it needs, while clients still see every status declared by the contract.

Here, `byId` reads its validated path parameter and returns one of its declared `200` or `404` responses. `rename` receives a validated JSON body. The tree is complete because it implements both children of `users` as well as `health`.

## Mount and inspect one request

`fetchAdapter().mount()` adapts the implementation to the Web `Request` and `Response` boundary.

```ts
// src/api/http.ts
import { fetchAdapter } from '@hulla/api/fetch'
import { implementation } from './server'

export const fetch = fetchAdapter().mount(implementation)

const result = await fetch(new Request('http://localhost/api/users/ada'))
console.log(result.status) // 200
console.log(await result.json()) // { id: 'ada', name: 'Ada' }
```

The mounted handler matches `GET /api/users/:id`, runs `byId`, and serializes the declared response. In an application, export the handler in the form expected by the host framework. Choose a host integration in [server adapters](/docs/api/servers). To call the same implementation inside one process, use the client and `inProcessTransport()` from the [quick start](/docs/api/quick-start).

Next, read [server context and middleware](./server-context.md) for request-scoped values and policies, [server fragments and composition](./server-composition.md) for modular or independently mountable implementations, or [error handling](./errors.md) for declared application failures.
