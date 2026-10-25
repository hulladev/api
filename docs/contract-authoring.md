# Contracts

A [contract](https://hulla.dev/docs/api/mental-model) lists your API's routes and describes what each accepts and returns. The server uses it to check requests. The client uses it to type your calls.

Keep the contract in a shared file so both can import it. The handlers live separately on the server.

## Declare the endpoints

In `src/api/contract.ts`, compose paths from a base path, router paths, and route paths. The object keys name the typed call tree; they are not URL segments.

```ts
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

| Route key | Effective endpoint |
| --- | --- |
| `health` | `GET /api/health` |
| `users.byId` | `GET /api/users/:id` |
| `users.rename` | `PATCH /api/users/:id` |

`basePath`, router path, and route path combine to form each URL. Object keys form the typed call tree; renaming a key changes client/server calls, not the URL. Every `:param` placeholder needs a matching key in that route or router's object-shaped `params` schema. Router params are inherited by child routes; route-level params can add route-specific keys.

Declared paths describe route structure, not already encoded URLs. They cannot contain percent signs, control characters, query strings, hash fragments, empty segments, backslashes, or literal `.` and `..` segments. Put dynamic values in path parameters instead. The client encodes parameter values and the server decodes them once; literal parameter values `.` and `..` are rejected so URL normalization cannot change the endpoint.

## Declare only accepted request inputs

Inputs are opt-in. Add `params`, `query`, `headers`, or `body` only when a route accepts that input. In the example, both user routes accept an `id` path parameter, while only `rename` accepts a JSON body. `GET` routes cannot declare a body. A body declaration also names its HTTP representation; use `request.json()`, `request.text()`, `request.bytes()`, or `request.formData()` for JSON, text, bytes, or form data.

## Declare every response the route can return

Each route lists its concrete response statuses and representations. Here, `users.byId` and `users.rename` may return JSON with status `200` or `404`; `health` returns the text `ok` with status `200`. A status is not implicit: declare each result the handler may produce, using `response.json()`, `response.text()`, or another response helper for its representation.

These declarations shape both sides of the boundary. A server implementation is typed against the declared status/body alternatives, and a client receives a status-discriminated result that it can narrow before reading the body. For example, after calling `users.byId`, check `result.status` before treating its body as either the user object or the not-found message.

Contract-declared errors are separate reusable application failures, not route response schemas. A declared error status cannot also be used by a route response; see [the error model](./errors.md).

## Choose type-only declarations, schemas, or codecs

Choose the declaration according to what should happen at runtime:

| Declaration | What it provides | Use it when |
| --- | --- | --- |
| `request.json<Input>()` or `response.json<Output>()` | Compile-time types for native JSON; no application-shape validation | The producer already guarantees the shape and runtime checks are not needed |
| An explicit Standard Schema, such as a Zod schema | Runtime validation; a transforming schema can also convert values in its validation direction | You want the server to validate decoded request input or validate/transform a response |
| An explicit `codec()` | Conversion between an application value and its wire representation | Both sides should use a richer value than the HTTP representation, such as `Date` in the application and an ISO string on the wire |

For example, replacing the `request.json(...)` declaration with `request.json<{ name: string }>()` preserves a TypeScript input type but does not check the parsed application's data against that shape. Supplying the Zod schema shown above opts into runtime validation. Do the same for responses with `response.json<Output>()` versus `response.json(schema)`.

Clients do not run ordinary request schemas: the server validates the decoded request before calling the handler. The server validates and transforms an ordinary response before serialization; the client trusts that output and does not rerun the schema. Defaults, transformations, and unknown-field stripping therefore affect the handler's request value or the client's response value. A codec encodes at the sending boundary and decodes at the receiving boundary. Native JSON parsing still rejects malformed JSON when the declaration is type-only, but type-only declarations do not validate application data shape. See [request transport](./request-transport.md) for representation details and [value round trips](./value-round-trips.md) for schema and codec examples.

## Next steps

The contract declares the API but has no handlers and does not listen for requests. Continue to [server implementations](./server-authoring.md) to implement the routes, then choose an adapter to mount it in your framework. In a client application, use the same contract with `createClient()` as described in [client authoring](./client-authoring.md).
