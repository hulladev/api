# Server authoring

`defineServer()` binds a contract to context, middleware, and handler implementations. `implement(handlers)` implements the root contract, while `implement(node, handlers)` exhaustively implements one route or recursive router fragment. Implementations and fragments remain portable unless their server definition declares a native adapter requirement. `implement(...fragments)` composes enough smaller fragments to cover the root contract.

```ts
import { defineServer } from '@hulla/api/server'

const server = defineServer(contract, {
  context: async ({ route }) => ({
    requestId: crypto.randomUUID(),
    routeKey: route.key,
  }),
})
```

The context factory's resolved object is inferred once and exposed as `input.context` in every middleware and route handler.

Declare an adapter when the context needs host-native values. The descriptor contributes those values to the factory's
input type and intentionally binds every implementation and fragment created from that definition:

```ts
import { fetchAdapter } from '@hulla/api/fetch'

const server = defineServer(contract, {
  adapter: fetchAdapter(),
  context: ({ request, route }) => ({
    signal: request.signal,
    route,
  }),
})
```

Omit `adapter` when context uses only route metadata or request-independent services. That implementation can be mounted
through any compatible adapter or `inProcessTransport()`. Declaring an adapter without a context factory is also valid
when an application wants to enforce one deployment target. Compatibility is checked once when the implementation is
mounted; adapter selection adds no per-request dispatch or route metadata.

Keep the factory for request-scoped identity and shared state. If a dependency is expensive and only some routes need it, return a lazy memoized function such as `user: once(() => loadUser())`; an object mapping of eager functions would otherwise push caching, errors, and lifecycle rules into the framework.

## Middleware

Client, server, and procedure middleware receive one options object. Server middleware and handlers receive the contract's declared error factories. They may return or throw an occurrence:

```ts
const requireUser = server.middleware(async ({ context, errors, next }) => {
  if (!context.user) {
    return errors.UNAUTHENTICATED()
  }

  return next()
})

const authenticated = server.use(requireUser)
```

The declaration selects its exact data type. HTTP status is attached separately by `defineContract()`, so the same declaration remains usable in procedures and other transports.

Pass a mounted contract router or route as the first argument to scope one middleware while implementing an ordinary complete handler tree:

```ts
const implementation = server
  .use(logRequests)
  .use(contract.routes.organizations, requireUser)
  .implement({
    health,
    organizations: {
      createUser,
      listUsers,
    },
  })
```

`use(middleware)` applies globally, `use(router, middleware)` applies below that router, and `use(route, middleware)` applies only to that route. Registrations run in declaration order. Separately registering the same middleware in overlapping scopes runs it once per matching registration; there is no function-identity deduplication. Scopes are compiled into each route's final middleware chain when the implementation is created, so request execution performs no scope matching.

A `.use()` scope applies to every implementation created from that scope. Fragments created from descendant scopes retain their additional middleware when deployed alone or composed through a common ancestor:

```ts
const observed = server.use(logRequests)

const publicRoutes = observed.implement(contract.routes.health, ({ response }) => response(200, 'ok'))

const protectedRoutes = observed.use(requireUser).implement(contract.routes.organizations, {
  createUser,
  listUsers,
})

const implementation = observed.implement(publicRoutes, protectedRoutes)
```

Here every route uses `logRequests`, while only `protectedRoutes` uses `requireUser`. The context factory still belongs to the original `defineServer()` scope and runs once for the matched route. Fragments from separate server definitions cannot be composed, and a composition scope can accept only its own fragments or descendants. Middleware can also branch on `input.route` when one cross-cutting policy intentionally covers selected routes.

`next()` is single-use. Calling it more than once fails deterministically.

## Complete root implementation

Select the root contract and pass its complete handler tree to `implement()`:

```ts
const implementation = authenticated.implement({
  health: ({ response }) => response(200, 'ok'),

  organizations: {
    createUser: async ({ params, query, headers, body, context, response, route }) => {
      const existing = await findUser(params.userId)
      if (existing) {
        return response(409, { code: 'CONFLICT' })
      }

      return response(
        201,
        await createUser({
          organizationId: params.organizationId,
          userId: params.userId,
          notify: query.notify,
          actorId: headers['x-actor-id'],
          createdAt: body.createdAt,
          requestId: context.requestId,
        }),
        { etag: `"${params.userId}"` }
      )
    },
  },
})
```

Each handler receives only one input object:

- `params`, `query`, `headers`, and `body` are decoded application values declared by that route.
- `context` is the inferred context-factory result.
- `response(status, body, headers?)` creates the status-discriminated result for that route.
- `route` contains the literal key, method, and fully joined path.

Portable handlers and middleware intentionally do not receive a transport request. Use an adapter-specific context helper when application context needs native framework state.

The status discriminates the complete response envelope. An empty response forbids `body`; a raw response carries an adapter-native value and forbids separate headers; schema-backed response headers are required and typed when declared.

Handlers must cover every status declared by their route. Runtime execution also rejects undeclared statuses, validates ordinary response inputs, and encodes codec application values before serializing the selected body and headers.

## Organizing handler values across modules

Handler modules may export implementation fragments. Use the type-only helper when a module needs contextual typing but the application prefers to assemble one ordinary handler tree:

```ts
import type { ServerHandlersOf } from '@hulla/api/server'

type AppHandlers = ServerHandlersOf<typeof server>

export const healthHandlers = {
  health: ({ response }) => response(200, 'ok'),
} satisfies Pick<AppHandlers, 'health'>

export const organizationHandlers = {
  organizations: {
    // ...
  },
} satisfies Pick<AppHandlers, 'organizations'>

export const implementation = server.implement({
  ...healthHandlers,
  ...organizationHandlers,
})
```

Root `implement()` checks completeness and unknown or invalid handlers at the JavaScript boundary as well as through TypeScript.

## Deployable implementation fragments

Select the contract node that a fragment owns. A router implementation must exhaust every route below that router, while a route implementation accepts exactly one handler:

```ts
const health = server.implement(contract.routes.health, ({ response }) => response(200, 'ok'))

const organizations = server.implement(contract.routes.organizations, {
  createUser,
  listUsers,
})
```

Mounted nodes retain their exact key, full path, and every inherited router parameter. Declarations are referenced rather than cloned at router and contract boundaries. One declaration can appear only once inside a contract; create separate declarations when two mounted paths need the same shape. Compatible handler functions remain reusable.

A fragment can execute independently as a one-route handler or small router:

```ts
import { createFetchHandler } from '@hulla/api/fetch'

export const GET = createFetchHandler(health)
```

Fragments can compose a complete implementation. TypeScript and runtime validation require complete root coverage, and runtime validation rejects duplicate implementations:

```ts
const implementation = server.implement(health, organizations)
```

`implement(...fragments)` composes fragments, while `implement(handlers)` accepts a complete raw handler tree. Composition merges handler descriptors into one runtime rather than chaining Fetch handlers or route dispatchers, so a fragment behaves the same alone and after composition.

## Declared errors sharing a status

Several errors may share one status because contract enrichment always uses arrays:

```ts
const errors = defineErrors({
  USER_NOT_FOUND: {
    message: 'User not found',
    data: z.object({ id: z.string() }),
  },
  ORGANIZATION_NOT_FOUND: {
    message: 'Organization not found',
  },
})

const contract = defineContract({
  errors: {
    404: [errors.USER_NOT_FOUND, errors.ORGANIZATION_NOT_FOUND],
  },
  routes: {
    user: route.get('/users/:id', {
      responses: { 200: response.json(userSchema) },
    }),
  },
})
```

The error code discriminates the wire union. Returning `errors.USER_NOT_FOUND({ data: { id } })` and throwing the same value have identical HTTP behavior.

## Fetch and adapter execution

```ts
import { createFetchHandler } from '@hulla/api/fetch'

export const fetch = createFetchHandler(implementation)
```

`createFetchHandler()` accepts either a complete implementation or a fragment and handles Fetch request extraction and response construction. Declare `fetchAdapter()` when the context factory needs the native Fetch `Request`:

```ts
import { createFetchHandler, fetchAdapter } from '@hulla/api/fetch'

const server = defineServer(contract, {
  adapter: fetchAdapter(),
  context: ({ request, route }) => ({
    requestId: request.headers.get('x-request-id') ?? crypto.randomUUID(),
    routeKey: route.key,
  }),
})
```

An adapter declaration binds the implementation and every fragment created by that server definition. The implementation
above can be mounted only through the Fetch adapter. An incompatible mount, including
`inProcessTransport(implementation)`, fails when the adapter is created. Keep the ordinary `defineServer()` context
factory and omit `adapter` when it needs only `route` metadata or request-independent services and the implementation
should remain portable across adapters.

`createAdapterRuntime()` from `@hulla/api/adapters` compiles individually executable routes for native framework routers, while `createAdapterHandler()` adds the shared matcher for catch-all and function adapters. The runtime accepts already-extracted native values and never constructs a Fetch `Request` or `Response`; each adapter owns request extraction, lifecycle integration, and response writing.

The adapter runtime's immutable `routes` property lists the method, full path, structural key, and preselected route executor for that implementation or fragment. Framework integrations register those routes natively and invoke `route.execute()` without repeating Hulla route matching.

Standalone fragments compile execution data only for their selected routes. The shared canonical route plan caches compilation only; requests, responses, handler results, and application data are never cached.
