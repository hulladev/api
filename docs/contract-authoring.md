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

Declared base, router, and route paths cannot contain percent signs or control characters. Use path parameters for
values containing literal percent signs or other characters requiring URL encoding; the client encodes those values
and the server decodes them once. Pre-encoded path declarations, including encoded dot segments, are rejected at setup.

## Requests and responses

Route inputs are opt-in. Declare `params`, `query`, `headers`, and `body` only when the endpoint accepts them. A request
body also declares its HTTP representation through helpers such as `request.json()`, `request.text()`, or
`request.bytes()`.

Every concrete response status must be declared. Its representation and schema determine both runtime validation and
the status-discriminated server/client result type. A handler for `users.byId`, for example, can construct only its
declared `200` and `404` responses, and a client can narrow `result.status` before reading the corresponding body.

For native JSON with compile-time types only, use `request.json<Input>()` and `response.json<Output>()`. Passing a schema explicitly adds runtime validation; passing a transforming schema or codec explicitly adds conversion. There is no client-wide validation switch. Type-only declarations do not verify application data at runtime.

Ordinary Standard Schemas validate one direction. Use an explicit `codec()` when the application value and HTTP wire
value differ—for example, when a `Date` is encoded as an ISO string. The detailed representation and codec rules are in
[request transport](./request-transport.md).

## Next steps

The contract has no handlers and does not listen for requests. Continue with [server authoring](./server-authoring.md)
to create an implementation with `defineServer()`, then choose a framework adapter to mount it. Client applications use
the same contract with `createClient()` as described in [client authoring](./client-authoring.md).

## Validation direction

Use ordinary schemas as the default for checked HTTP contracts. Request schemas run on the server after parsing. Response schemas run on the server before serialization, and their output is sent to the client. This includes stripping unknown object fields, defaults, and transformations. Handler return types describe schema input; client response types describe schema output. Ordinary response outputs must match their representation: JSON-compatible values for JSON, strings for text and headers, and bytes for byte bodies.

Use `codec()` when both client and handler should work with a richer application value, such as `Date`. The codec encodes at the sending boundary and decodes at the receiving boundary. Native type-only declarations remain available when runtime shape checks are unnecessary. There is no validation mode setting.

See [value round trips](./value-round-trips.md) for numeric and date examples across these declarations.
