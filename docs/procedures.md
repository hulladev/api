# Procedures

Procedures are an optional application-function primitive. Use one only when an operation independently benefits from validation, context, or middleware. An ordinary function is the better default, and HTTP-shaped operations should use the contract and an appropriate transport rather than duplicate route semantics.

```ts
import { defineProcedure } from '@hulla/api/procedure'
import { z } from 'zod'

const procedure = defineProcedure()

export const fullName = procedure
  .input(z.object({ first: z.string(), last: z.string() }))
  .output(z.string())
  .handler(({ input }) => `${input.first} ${input.last}`)
```

Input schemas decode call arguments before the handler. Output schemas validate and decode handler results. With synchronous schemas, context, middleware, and handlers, the call remains synchronous; introducing an asynchronous step changes the exact return type to `Promise<Result>`.

## Context and middleware

```ts
const base = defineProcedure({
  context: ({ input }) => ({
    requestId: crypto.randomUUID(),
    input,
  }),
})

const trace = base.middleware(({ context, next }) => {
  console.time(context.requestId)
  const result = next()
  console.timeEnd(context.requestId)
  return result
})

export const operation = base.use(trace).handler(() => 'ok')
```

`.middleware()` defines a reusable value and `.use()` returns a derived authoring scope, matching the client and server middleware model. Context runs once per call after input validation. Lazy work can be exposed as memoized functions on the returned context object when only some handlers need it.

There is deliberately no procedure registry, structural tree identity, or plugin hook. Group procedures with ordinary objects and modules:

```ts
export const users = {
  create: createUser,
  remove: removeUser,
}
```

For route-derived schemas, use `contract.routeInput(route)` or `contract.routeOutput(route, status)` when the complete directional schema is useful. Procedures accept schemas, not HTTP body or response descriptors.
