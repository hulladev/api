# Contract authoring

An `@hulla/api` contract declares the HTTP boundary shared by the server implementation and every typed client. Define
it in a module that is safe to import from both server and client code: schemas, paths, request representations, and
declared responses belong here; database access and framework state do not.

Install `@hulla/api` and one Standard Schema implementation. The examples use Zod, but Valibot and other Standard
Schema libraries work without an adapter:

```sh
bun add @hulla/api zod
```

## Define a contract

This contract is used by the framework adapter guides:

```ts
// src/api/contract.ts
import { defineContract, request, response, route, router } from '@hulla/api'
import { z } from 'zod'

const user = z.object({
  id: z.string(),
  name: z.string(),
})

const userParams = z.object({ id: z.string() })
const notFound = response.json(z.object({ message: z.string() }))

export const contract = defineContract({
  basePath: '/api',
  routes: {
    health: route.get('/health', {
      responses: { 200: response.text(z.literal('ok')) },
    }),
    users: router('/users', {
      routes: {
        byId: route.get('/:id', {
          params: userParams,
          responses: {
            200: response.json(user),
            404: notFound,
          },
        }),
        rename: route.patch('/:id', {
          params: userParams,
          body: request.json(z.object({ name: z.string().min(1) })),
          responses: {
            200: response.json(user),
            404: notFound,
          },
        }),
      },
    }),
  },
})
```

The effective endpoints are `GET /api/health`, `GET /api/users/:id`, and `PATCH /api/users/:id`. `basePath`, router
paths, and route paths compose structurally; object keys such as `users.byId` form the typed server and client call tree
but do not add URL segments themselves.

## Requests and responses

Route inputs are opt-in. Declare `params`, `query`, `headers`, and `body` only when the endpoint accepts them. A request
body also declares its HTTP representation through helpers such as `request.json()`, `request.text()`, or
`request.bytes()`.

Every concrete response status must be declared. Its representation and schema determine both runtime validation and
the status-discriminated server/client result type. A handler for `users.byId`, for example, can construct only its
declared `200` and `404` responses, and a client can narrow `result.status` before reading the corresponding body.

Ordinary Standard Schemas validate one direction. Use an explicit `codec()` when the application value and HTTP wire
value differ—for example, when a `Date` is encoded as an ISO string. The detailed representation and codec rules are in
[request transport](./request-transport.md).

## Next steps

The contract has no handlers and does not listen for requests. Continue with [server authoring](./server-authoring.md)
to create an implementation with `defineServer()`, then choose a framework adapter to mount it. Client applications use
the same contract with `defineClient()` as described in [client authoring](./client-authoring.md).
