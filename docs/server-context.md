# Server context and middleware

Create context when several handlers need the same request data, such as the current user or a request ID. Add middleware for work that runs before or after a handler, such as checking access or logging a response.

## Create portable request context

The examples use the [shared contract](./contract-authoring.md). The context callback receives an abort `signal` and the matched `route`. Return the values your handlers need; their types are inferred as `input.context`.

```ts
import { defineServer } from '@hulla/api/server'
import { contract } from './contract'

const server = defineServer(contract, {
  context: ({ route, signal }) => ({
    requestId: crypto.randomUUID(),
    routeKey: route.key.join('.'),
    signal,
  }),
})
```

This context does not depend on Fetch or another host, so its implementations can be mounted through compatible adapters or called in process. Pass `signal` to cancellable work so downstream operations can stop when the request is cancelled.

## Add native context only for host-specific needs

When application logic needs a native request value, create the adapter first and wrap the context factory with `adapter.context()`. This example reads an identity header; middleware and handlers receive the resulting `userId`, not the native `Request`.

```ts
import { defineServer } from '@hulla/api/server'
import { fetchAdapter } from '@hulla/api/fetch'
import { contract } from './contract'

const adapter = fetchAdapter()
const server = defineServer(contract, {
  context: adapter.context(({ request }) => ({
    userId: request.headers.get('x-user-id') ?? undefined,
  })),
})
```

> Wrapping a context factory with `adapter.context()` binds every implementation from that server definition to the same adapter kind. Keep context portable unless handlers genuinely need native host data.

The adapter still owns request parsing and response writing. See [server adapters](/docs/api/servers) for host-specific setup and [adapter behavior](/docs/api/reference/adapter-conformance) for the behavior every adapter must preserve.

## Apply middleware globally or to a route scope

Use `server.middleware()` to type middleware against the context and contract. Middleware receives `signal`, `context`, `route`, `next`, and declared `errors` when the contract defines them.

The authentication example below requires an `UNAUTHENTICATED` error in your contract; see [declared errors](./errors.md#declared-application-errors).

```ts
const logRequest = server.middleware(async ({ context, route, next }) => {
  console.info(context.userId, route.method, route.path)
  return next()
})

const requireUser = server.middleware(async ({ context, errors, next }) => {
  if (!context.userId) return errors.UNAUTHENTICATED()
  return next()
})
```

Both functions use the Fetch-backed `server` above, so `context.userId` is inferred. Returning the declared error skips the remaining middleware and handler. Middleware and handlers may also throw a declared error. See [error handling](./errors.md).

Apply middleware while building the implementation:

```ts
const implementation = server
  .use(logRequest)
  .use(contract.routes.users, requireUser)
  .implement({
    health: ({ response }) => response(200, 'ok'),
    users: {
      byId: ({ params, response }) =>
        params.id === 'ada'
          ? response(200, { id: 'ada', name: 'Ada' })
          : response(404, { message: 'User not found' }),
      rename: ({ params, body, response }) =>
        response(200, { id: params.id, name: body.name }),
    },
  })
```

| Registration | Routes that run it |
| --- | --- |
| `.use(middleware)` | Every route |
| `.use(router, middleware)` | Every route below that router |
| `.use(route, middleware)` | That route only |

Calls to `use()` preserve declaration order. For a matched route, middleware wraps the next middleware and finally the handler: code before `await next()` runs on entry, and code after it resumes as the result returns outward. Separate registrations in overlapping scopes each run.

`next()` is single-use. Call it once to continue, or return a response or declared error to stop. Implementations created from child scopes retain middleware from those scopes; [server fragments and composition](./server-composition.md) shows how that inheritance behaves when fragments are mounted or composed.
