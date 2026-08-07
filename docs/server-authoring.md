# Server authoring

This document records the server-authoring API and naming conventions.

## Vocabulary

- `defineServer()` creates a transport-neutral server authoring scope.
- The authoring scope is conventionally named `server`.
- `server.implement()` defines a partial handler implementation without mutating the authoring scope.
- Handler fragments are conventionally named `*Handlers`.
- `server.build()` combines fragments and returns a complete server implementation.
- The completed implementation is conventionally named `implementation`.
- Backend integrations accept only the completed server implementation, never the authoring scope or an individual fragment.

```ts
// server.ts
const base = defineServer(contract, { context: createContext })
const authenticate = base.middleware((actions, args) => {
  if (!args.context.user) {
    return actions.error(401, { body: { code: 'UNAUTHENTICATED' } })
  }

  return actions.next()
})

export const server = base.use(authenticate)
```

```ts
// handlers/health.ts
import { server } from '../server'

export const healthHandlers = server.implement({
  health(actions, args) {
    return actions.respond({
      status: 200,
      body: `healthy:${args.context.requestId}`,
    })
  },
})
```

```ts
// implementation.ts
import { server } from './server'
import { healthHandlers } from './handlers/health'
import { organizationHandlers } from './handlers/organizations'

export const implementation = server.build(healthHandlers, organizationHandlers)
```

## Composition guarantees

- A fragment may implement any subset of routes, including part of a router.
- Every fragment receives the exact route input and server context types from its authoring scope.
- Handlers must return every response status declared for their route.
- Route response values are checked at `actions.respond()`, while middleware errors are checked at `actions.error()`.
- Fragments compose recursively and duplicate leaf handlers are rejected.
- Fragments created by root and derived server scopes compose in one build, preserving each fragment's middleware stack.
- `server.build()` requires every route in the contract exactly once at compile time.
- `server.build()` also checks duplicates and completeness at runtime for JavaScript consumers.
- Framework adapters require the complete implementation type, preserving the full-contract guarantee at the transport boundary.

## Module dependencies

Keep the authoring scope separate from the completed server module:

```text
contract -> server -> handler fragments -> implementation -> framework integration
```

`server.ts` does not import handler fragments. Handler fragments import `server`, and `implementation.ts` imports both,
so the runtime dependency graph remains acyclic.

## Responses and errors

Routes own every outcome in their response map. The contract separately declares the error responses available to middleware, indexed by their HTTP status. Both use the same response helpers:

```ts
const apiError = response.json(
  z.object({
    code: z.enum(['UNAUTHORIZED', 'CONFLICT']),
    message: z.string().optional(),
  })
)

const contract = defineContract({
  errors: {
    401: apiError,
  },
  routes: {
    createUser: route.post('/users', {
      responses: {
        201: response.json(user),
        409: apiError,
      },
    }),
  },
})
```

The error body has no Hulla-required fields. Different statuses may use different response representations, schemas, and headers. A route may reuse the same response descriptor, but its declarations remain owned by the route.

Handlers use `actions.respond()` for every route-owned response, including failure statuses:

```ts
createUser(actions, args) {
  if (alreadyExists(args.body)) {
    return actions.respond({ status: 409, body: { code: 'CONFLICT' } })
  }

  return actions.respond({ status: 201, body: createUser(args.body) })
}
```

Middleware is declared through the server so its context and contract errors are already known. `actions.error()` accepts only statuses from `contract.errors` and infers the selected status from the middleware return type:

```ts
const base = defineServer(contract, { context: createContext })
const authenticate = base.middleware((actions, args) => {
  if (!args.context.user) {
    return actions.error(401, { body: { code: 'UNAUTHORIZED' } })
  }

  return actions.next()
})

const protectedServer = base.use(authenticate)
```

`server.middleware()` defines a reusable middleware value without applying it. `server.use()` returns a derived scope and accepts one or more middleware values in execution order. Middleware errors supplement route responses; they never remove a route handler's response obligations.

## Handler parameter convention

Actions come first because handlers and middleware always use them to produce a result, while request arguments are often unused. Documentation should keep request data in a plain `args` parameter instead of destructuring it in the parameter list:

```ts
createUser(actions, args) {
  args.body
  args.query
  args.params
  args.context
  args.route
}
```

`args.route` contains the handler's exact metadata without requiring a type import. Its `key`, `method`, and `path`
remain literal types inferred from the contract.

Typing `args.` triggers the editor's complete property list automatically. The list contains only fields available to that route, so routes without a body, query, headers, or parameters do not advertise those fields. Users can destructure after discovering the available arguments when that makes the implementation clearer:

```ts
createUser(actions, args) {
  const { body, context, params, query } = args
  // ...
}
```

Inline parameter destructuring remains supported, but it should not be the primary documentation style because editors generally do not open completion lists automatically on an empty destructuring pattern.
