# Server fragments and composition

As your API grows, move related handlers into separate files. You can assemble those files into one implementation, or create [fragments](#create-independently-mountable-fragments) that can be mounted separately.

The examples use the contract and server definition from [Server implementations](./server-authoring.md).

| Need                                                                             | Use                                                         |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Keep related handlers in separate files | `ServerHandlersOf` and one root `implement()` call |
| Mount part of the API on its own | A fragment from `implement(node, handlers)` |

## Assemble handler objects across modules

`ServerHandlersOf<typeof server>` provides the fully typed handler tree for a server definition. Each module can export a checked subtree; the entry module joins those objects and calls root `implement()` once.

```ts
// src/api/health-handlers.ts
import type { ServerHandlersOf } from '@hulla/api/server'
import { server } from './server'

type Handlers = ServerHandlersOf<typeof server>

export const healthHandlers = {
  health: ({ response }) => response(200, 'ok'),
} satisfies Pick<Handlers, 'health'>
```

```ts
// src/api/users-handlers.ts
import type { ServerHandlersOf } from '@hulla/api/server'
import { server } from './server'

type Handlers = ServerHandlersOf<typeof server>

export const userHandlers = {
  users: {
    byId: ({ params, response }) =>
      params.id === 'ada'
        ? response(200, { id: 'ada', name: 'Ada' })
        : response(404, { message: 'User not found' }),
    rename: ({ params, body, response }) =>
      response(200, { id: params.id, name: body.name }),
  },
} satisfies Pick<Handlers, 'users'>
```

```ts
// src/api/implementation.ts
import { server } from './server'
import { healthHandlers } from './health-handlers'
import { userHandlers } from './users-handlers'

export const implementation = server.implement({
  ...healthHandlers,
  ...userHandlers,
})
```

This keeps modules independently typed while producing one ordinary handler tree. Root `implement()` still requires complete coverage. Use fragments instead when modules need standalone mounts or distinct middleware scopes.

## Create independently mountable fragments

Call `implement(node, handlers)` with a contract route or router. A route node takes its single handler; a router node takes handlers for every route beneath it.

```ts
// src/api/health.ts
import { contract } from './contract'
import { server } from './server'

export const health = server.implement(
  contract.routes.health,
  ({ response }) => response(200, 'ok')
)
```

```ts
// src/api/users.ts
import { contract } from './contract'
import { server } from './server'

export const users = server.implement(contract.routes.users, {
  byId: ({ params, response }) =>
    params.id === 'ada'
      ? response(200, { id: 'ada', name: 'Ada' })
      : response(404, { message: 'User not found' }),
  rename: ({ params, body, response }) =>
    response(200, { id: params.id, name: body.name }),
})
```

Either fragment can be mounted independently. Here the selected health route is the whole mounted implementation:

```ts
import { fetchAdapter } from '@hulla/api/fetch'
import { health } from './health'

const fetch = fetchAdapter().mount(health)
const result = await fetch(new Request('http://localhost/api/health'))

console.log(result.status) // 200
console.log(await result.text()) // ok
```

A router fragment exposes every route below the selected router. Choose a host-specific mount in [server adapters](/docs/api/servers); [adapter behavior](/docs/api/reference/adapter-conformance) explains the behavior all mounts preserve.

## Compose the root implementation

When one deployment needs the whole contract, pass every fragment to `compose()`:

```ts
// src/api/implementation.ts
import { server } from './server'
import { health } from './health'
import { users } from './users'

export const implementation = server.compose(health, users)
```

Composition follows four rules:

- Fragments must originate from the same `defineServer()` root.
- The scope calling `compose()` accepts fragments created from itself or its descendants, not sibling scopes.
- Together, the fragments must implement every root route exactly once; missing and duplicate routes are rejected.
- A fragment created from a scoped server retains that scope's middleware when mounted alone or composed through a compatible ancestor.

The last rule lets one fragment inherit public middleware and another inherit additional protected-route middleware. See [server context and middleware](./server-context.md) for scope and execution-order details.

A route declaration may be mounted under more than one router key. Each mounted node has its own key and full path, so each fragment selects the mounted node it implements even when handler functions are reusable.

Continue to [server adapters](/docs/api/servers) to mount the complete implementation or a standalone fragment.
