# Procedures

Procedures are optional application functions. They are not HTTP routes, client extensions, or server service locators. A procedure owns only the pieces it declares: input, output, context, middleware, and a handler.

Procedure scopes accept native Standard Schemas without validator configuration:

```ts
import { defineProcedures } from '@hulla/api/procedure'
import { z } from 'zod'

const procedure = defineProcedures()

export const fullName = procedure
  .input(z.object({ first: z.string(), last: z.string() }))
  .output(z.string())
  .handler(({ input }) => `${input.first} ${input.last}`)

fullName({ first: 'Samuel', last: 'Hulla' })
```

One-off procedures are callable immediately and have no structural identity.

## Reusing route declarations

`.input()` and `.output()` accept Standard Schemas only. Procedures never interpret HTTP request or response descriptors; that representation work belongs to the client and server.

`contract.routeInput()` composes a route's declared params, query, headers, and body into a Standard Schema. Its input is the client-call shape and its output is the server-handler shape:

```ts
const route = contract.routes.organizations.createUser
const input = contract.routeInput(route)

const createUser = procedure
  .input(input)
  .output(contract.routeOutput(route, 201))
  .handler(async ({ input }) => {
    const created = await userService.create(input)
    return { id: created.id, createdAt: created.createdAt.toISOString() }
  })
```

`contract.routeOutput(route, status)` requires a status declared by that route and returns its exact body schema. The status is explicit because successful APIs are not limited to `200`. Empty, raw, and streaming responses do not have one schema representing their complete application value, so use a custom procedure output schema when needed.

The composed value is a portable Standard Schema rather than a library-native object schema. When a procedure needs `.pick()`, `.omit()`, or another library-specific composition operation, compose the original native schemas directly.

Procedure calls follow the same directional rule. Callers provide the input schema's input type; handlers receive its output type. With a declared output, handlers return that schema's input type and callers receive its output type.

The output declaration is optional. Without one, the return type is inferred from the handler. Declaring an output adds runtime validation and is useful at a deliberate application boundary.

## Exact synchronous and asynchronous calls

Procedure calls do not expose `Result | Promise<Result>`. A synchronous handler with synchronous input, output, context, and middleware returns `Result` directly. An async handler, context, schema, or middleware returns `Promise<Result>`. The selected mode is carried through both standalone procedures and built procedure trees.

Middleware therefore does not impose an asynchronous boundary by itself. Its `next()` call has the exact downstream result type, so a synchronous middleware can inspect or transform a synchronous result without a promise:

```ts
const trace = procedures.middleware(({ next }) => {
  events.push('before')
  const result = next()
  events.push('after')
  return result
})

const value: string = procedures.use(trace).handler(() => 'ok')()
```

Declaring the middleware `async` intentionally changes procedures using it to `Promise<Result>`. HTTP client and server middleware remain promise-based at their public boundary because Fetch execution is asynchronous.

Standard Schema deliberately does not describe whether a validator runs synchronously. Ordinary validator schemas need no @hulla/api-specific field and retain their normal developer experience. If a schema intentionally performs async validation, mark it without mutating the validator-owned object:

```ts
import { validation } from '@hulla/api'

const availableName = validation.async(
  z.string().refine(async (name) => isNameAvailable(name))
)

const registerName = procedure.input(availableName).handler(({ input }) => input)

const pending: Promise<string> = registerName('Ada')
```

`validation.async(schema)` is a small @hulla/api wrapper used only to make the execution mode explicit. Validator authors and users do not add a special property to their schemas. HTTP client and server calls remain asynchronous because Fetch itself is asynchronous.

## Context and middleware

`defineProcedures()` creates a reusable authoring scope when procedures need shared context or middleware:

```ts
const procedures = defineProcedures({
  context: () => ({ session: getSession() }),
})

const requireUser = procedures.middleware(async ({ context, next }) => {
  if (!context.session.user) throw new UnauthorizedError()
  return next()
})

const authenticated = procedures.use(requireUser)
```

Derived builders retain the same definition ownership while adding middleware immutably:

```ts
const requireAdmin = authenticated.middleware(async ({ context, next }) => {
  if (!context.session.user.isAdmin) throw new ForbiddenError()
  return next()
})

const admin = authenticated.use(requireAdmin)
```

## Structural identity

Use `build()` when procedures need stable structural identities for tooling, tracing, or future integrations. Ordinary nested objects define the hierarchy:

```ts
const list = authenticated
  .input(listUsersInput)
  .handler(({ input, context }) => userService.list(context.session.user, input))

const create = authenticated
  .input(contract.routeInput(contract.routes.organizations.createUser))
  .handler(({ input, context }) => userService.create(context.session.user, input))

export const api = procedures.build({
  users: {
    list,
    create,
  },
})
```

The resulting tree remains directly callable and exposes non-enumerable metadata on each leaf:

```ts
await api.users.list(input)

api.users.list.$meta.key
// readonly ['users', 'list']
```

A procedure may appear only once in a built tree, giving it one canonical identity. Every leaf must originate from the same `defineProcedures()` scope or one of its derived builders. This prevents a tree from accidentally mixing incompatible context and middleware definitions.

The built tree is an executable registry, not a separate declaration/implementation contract. Schemas and handlers stay colocated on each procedure.

Procedure-capable plugins register on the authoring scope and apply when a tree is built. Standalone procedures remain unchanged because they have no structural identity:

```ts
const procedures = defineProcedures({ plugins: [tanstackQueryPlugin()] })
const api = procedures.build({ users: { list, create } })

api.users.$queryKey()
api.users.list.$queryOptions(input)
```

On the server, call application services directly. Defining a server-side procedure is reasonable when it independently benefits from procedure validation or middleware, but the library does not manufacture HTTP context or route server calls through the client contract.

## Contract references and types

Routers expose their children directly, while router-only declaration details live under `$meta`:

```ts
contract.routes.organizations.createUser
contract.routes.organizations.$meta.path
```

HTTP vocabulary remains intact. Responses stay under `responses`, and reusable application types are available without changing that shape:

```ts
type Input = ClientRouteInput<typeof contract.routes.organizations.createUser>
type Created = RouteResponseBody<typeof contract.routes.organizations.createUser, 201>

const inputSchema = contract.routeInput(contract.routes.organizations.createUser)
const createdSchema = contract.routeOutput(contract.routes.organizations.createUser, 201)
```
