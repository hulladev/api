# Server authoring

`defineServer()` binds a contract to context, middleware, and one complete handler tree. `build()` returns the transport-neutral implementation consumed by the built-in Fetch handler or a wire adapter.

```ts
import { defineServer } from '@hulla/api/server'

const server = defineServer(contract, {
  context: async ({ request, route }) => ({
    requestId: request.headers.get('x-request-id') ?? crypto.randomUUID(),
    user: await authenticate(request),
    routeKey: route.key,
  }),
})
```

The context factory's resolved object is inferred once and exposed as `input.context` in every middleware and route handler.

## Middleware

Client and server middleware share the `(input, next)` shape. A server middleware either continues or returns one of `contract.errors` directly:

```ts
const requireUser = server.middleware(async (input, next) => {
  if (!input.context.user) {
    return {
      status: 401,
      body: { code: 'UNAUTHENTICATED' },
    }
  }

  return next()
})

const authenticated = server.use(requireUser)
```

The error status selects its exact declared body and response-header types. Undeclared statuses, mismatched bodies, missing required headers, and invalid envelope properties are rejected by TypeScript.

A `.use()` scope applies to its complete contract. When route groups require independently scoped context or middleware, declare separate contracts and mount their Fetch or wire handlers through the host router. Middleware can also branch on `input.route` when one cross-cutting policy intentionally covers selected routes.

`next()` is single-use. Calling it more than once fails deterministically.

## Complete handler tree

Pass one contract-shaped handler tree to `build()`:

```ts
const implementation = authenticated.build({
  health: () => ({
    status: 200,
    body: 'ok',
  }),

  organizations: {
    createUser: async ({ params, query, headers, body, context, request, route }) => {
      const existing = await findUser(params.userId)
      if (existing) {
        return {
          status: 409,
          body: { code: 'CONFLICT' },
        }
      }

      return {
        status: 201,
        body: await createUser({
          organizationId: params.organizationId,
          userId: params.userId,
          notify: query.notify,
          actorId: headers['x-actor-id'],
          createdAt: body.createdAt,
          requestId: context.requestId,
        }),
        headers: { etag: `"${params.userId}"` },
      }
    },
  },
})
```

Each handler receives only one input object:

- `params`, `query`, `headers`, and `body` are decoded application values declared by that route.
- `context` is the inferred context-factory result.
- `request` is the original Fetch `Request`.
- `route` contains the literal key, method, and fully joined path.

The status discriminates the complete response envelope. An empty response forbids `body`; a raw response requires `Response` and forbids separate headers; schema-backed response headers are required and typed when declared.

Handlers must cover every status declared by their route. Runtime execution also rejects undeclared statuses and encodes the selected body and headers through their directional schemas.

## Organizing handlers across modules

Handler modules are ordinary TypeScript values; there is no runtime fragment abstraction. Use the type-only helper when a module needs contextual typing outside `build()`:

```ts
import type { ServerHandlersOf } from '@hulla/api/server'

type AppHandlers = ServerHandlersOf<typeof server>

export const healthHandlers = {
  health: () => ({ status: 200, body: 'ok' }),
} satisfies Pick<AppHandlers, 'health'>

export const organizationHandlers = {
  organizations: {
    // ...
  },
} satisfies Pick<AppHandlers, 'organizations'>

export const implementation = server.build({
  ...healthHandlers,
  ...organizationHandlers,
})
```

`build()` checks completeness and unknown or invalid handlers at the JavaScript boundary as well as through TypeScript.

## Global and route responses sharing a status

A route response may reuse a status from `contract.errors` only when both reference the same response declaration:

```ts
const notFound = response.json(notFoundSchema)

const contract = defineContract({
  errors: { 404: notFound },
  routes: {
    user: route.get('/users/:id', {
      responses: { 200: response.json(userSchema), 404: notFound },
    }),
  },
})
```

Different schemas under the same status would be ambiguous after a direct middleware or handler return, so contract construction rejects that combination.

## Fetch and wire execution

```ts
import { createFetchHandler } from '@hulla/api/server'

export const fetch = createFetchHandler(implementation)
```

`createFetchHandler()` handles Fetch request extraction and response construction. `createWireHandler()` from `@hulla/api/wire` exposes the lower-level host-neutral dispatcher used by framework adapters.

The shared canonical route plan caches compilation only. Requests, responses, handler results, and application data are never cached.
