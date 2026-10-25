# Express

Add your contract's routes to an Express app or `Router` with `@hulla/api-express`. Register your body parsers and middleware before mounting the routes.

## Install the adapter

The adapter supports Express 4.18 and later, including Express 5.

<!-- docs:package-manager -->

```sh
# Bun
bun add @hulla/api @hulla/api-express express zod && bun add --dev @types/express

# npm
npm install @hulla/api @hulla/api-express express zod && npm install --save-dev @types/express

# pnpm
pnpm add @hulla/api @hulla/api-express express zod && pnpm add --save-dev @types/express

# Yarn
yarn add @hulla/api @hulla/api-express express zod && yarn add --dev @types/express
```

## Mount a route and call it

Declare the HTTP boundary in a shared contract. This route accepts a user ID in the path and a new name in a JSON
body:

```ts
// src/api/contract.ts
import { defineContract, request, response, route } from '@hulla/api'
import { z } from 'zod'

export const contract = defineContract({
  basePath: '/api',
  routes: {
    renameUser: route.patch('/users/:id', {
      params: z.object({ id: z.string() }),
      body: request.json(z.object({ name: z.string().min(1) })),
      responses: {
        200: response.json(
          z.object({ id: z.string(), name: z.string() })
        ),
      },
    }),
  },
})
```

Implement that route in server-only code:

```ts
// src/api/server.ts
import { defineServer } from '@hulla/api/server'
import { contract } from './contract'

export const implementation = defineServer(contract).implement({
  renameUser: ({ params, body, response }) =>
    response(200, {
      id: params.id,
      name: body.name,
    }),
})
```

> Register body parsers and request-enriching middleware before `mount()`. Calling
> `expressAdapter(app)` creates the adapter; `mount()` is the operation that registers routes.

Create the Express app, install its JSON parser, and mount the implementation:

```ts
// src/server.ts
import { expressAdapter } from '@hulla/api-express'
import express from 'express'
import { implementation } from './api/server'

const app = express()

app.use(express.json({ limit: '1mb' }))

const adapter = expressAdapter(app)
adapter.mount(implementation)

app.listen(3000, '127.0.0.1', () => {
  console.log('API listening on http://127.0.0.1:3000')
})
```

`mount()` returns that same `app`. Once the server is running, send a request through Express:

```sh
curl -i -X PATCH http://127.0.0.1:3000/api/users/u_123 \
  -H 'content-type: application/json' \
  --data '{"name":"Grace"}'
```

The response has status `200`, an `application/json` content type, and this body:

```json
{"id":"u_123","name":"Grace"}
```

The request crossed Express's native router. It was not a direct call to the implementation.

## Keep middleware in execution order

The adapter registers one native Express route handler for every selected contract route. For a matching request:

1. Express runs middleware registered before the route, including parsers, authentication, and request enrichment.
2. Express matches the method and path and supplies `req.params`, `req.query`, `req.headers`, and `req.body`.
3. The adapter decodes and validates those values against the contract.
4. `@hulla/api` creates server context, runs its middleware, and calls the route handler.
5. The adapter writes the declared result through the Node response.

A successful adapter response finishes the request, so ordinary middleware registered later does not run. Unmatched
requests continue to later Express routes and middleware. Express error middleware still handles failures raised by
earlier Express middleware.

Express also owns matching details such as router prefixes, case sensitivity, and trailing-slash behavior. The adapter
passes the compiled contract method and path to Express instead of adding a catch-all route.

## Parse request bodies in Express

The adapter uses the parsed value already stored in `req.body`. Choose a parser and limit that match each contract
representation:

| Contract body | Middleware before `mount()` | Value supplied in `req.body` |
| --- | --- | --- |
| JSON | `express.json({ limit: '1mb' })` | Parsed JSON value |
| Text | `express.text({ type: 'text/*', limit: '1mb' })` | String |
| Bytes | `express.raw({ type: 'application/octet-stream', limit: '5mb' })` | `Buffer` or `Uint8Array` |
| Form data | Application-selected multipart middleware and mapping | Native `FormData` |

There is no adapter-side body-size option because Express performs the read. Parser limits and malformed-body errors
therefore belong to Express middleware and its error handler.

If a contract route expects a body but no earlier parser supplied one, the adapter returns an
`invalid-request-body` problem with status `400`. If the request content type does not match the declared
representation, it returns `unsupported-media-type` with status `415`.

## Scope routes with an Express Router

Mount an implementation fragment on a `Router` when a route group needs its own Express middleware or prefix:

```ts
import { expressAdapter } from '@hulla/api-express'
import express from 'express'
import { userFragment } from './api/users'
import { requireUser } from './middleware/require-user'

const router = express.Router()

router.use(requireUser)
expressAdapter(router).mount(userFragment)

app.use('/account', router)
```

Express prepends `/account` to the contract paths registered on this router. Only the routes selected by
`userFragment` are registered. See [server fragments and composition](./server-composition.md) for creating the
fragment.

## Add Express state to server context

Keep the context factory portable when it only needs application services or route metadata. Use
`adapter.context()` when handlers need the native Express request, response, or `res.locals`.

```ts
import { defineServer } from '@hulla/api/server'
import { expressAdapter } from '@hulla/api-express'
import express from 'express'
import { contract } from './api/contract'

type Locals = {
  tenantId: string
}

const app = express()

app.use((request, response, next) => {
  response.locals.tenantId = request.header('x-tenant-id') ?? 'public'
  next()
})

const adapter = expressAdapter<Locals>(app)

const implementation = defineServer(contract, {
  context: adapter.context(({ request, response, locals, route }) => ({
    originalUrl: request.originalUrl,
    requestId: response.getHeader('x-request-id'),
    routeKey: route.key.join('.'),
    tenantId: locals.tenantId,
  })),
}).implement({
  renameUser: ({ params, body, context, response }) => {
    console.info(context.tenantId, context.originalUrl)
    return response(200, { id: params.id, name: body.name })
  },
})

adapter.mount(implementation)
```

Supply the `Locals` type to `expressAdapter<Locals>()`; the generic does not populate `res.locals` at runtime.
Express middleware must set those values before the route runs. Declaration-merging additions from packages such as
authentication middleware remain available on the native `request` type.

`adapter.context()` binds the implementation to Express. Mounting it with another adapter fails immediately instead
of providing an incompatible request object. Context code may inspect the native response, but it should not finish
the response independently; the route handler returns the declared result that the adapter writes.

## Separate adapter errors from Express errors

Use `onError` to observe or replace failures from contract input decoding, server context, `@hulla/api` middleware,
the route handler, response serialization, or the adapter's transport write:

```ts
const adapter = expressAdapter(app, {
  onError({ error, phase, request, locals, defaultResponse }) {
    console.error(phase, request.originalUrl, locals, error)
    return defaultResponse
  },
})
```

`defaultResponse` is an adapter response value, not an Express `Response`. Return it to keep the protocol-safe
fallback, return another adapter response to replace it, or return `undefined` to keep the fallback automatically.
Options passed to `mount()` override adapter defaults for that mount; `onError: undefined` disables an inherited
hook.

Express parser and middleware failures that occur before the route do not enter `onError`; place an Express error
handler after the routes for those failures. If the adapter cannot write its fallback before headers are sent, it
passes that write failure to `next(error)`. If headers have already been sent, it closes the response because a new
status and body can no longer be written.

## Handle streams and disconnects

Declared stream responses are written as `Uint8Array` chunks with Node backpressure. The adapter also connects the
request lifetime to the handler's `AbortSignal`:

- aborting the request or closing the response early aborts cooperative handler work;
- closing a streaming response calls the source iterator's `return()` method;
- a failure after response headers have been sent cannot replace the response already in flight.

Use the handler's `signal` with database queries, fetch calls, and stream producers that support cancellation.

## Next steps

- [Server context and middleware](./server-context.md) explains portable context and route policies.
- [Server fragments and composition](./server-composition.md) shows how to build independently mountable route groups.
- [Typed clients](./client-authoring.md) calls the same contract from a browser or another service.
- [Express documentation](https://expressjs.com/) covers middleware, routers, and deployment.
