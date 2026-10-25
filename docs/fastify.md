# Fastify

Add your contract's routes to a Fastify app with `@hulla/api-fastify`. Register them in the plugin scope whose hooks and decorators you want the handlers to use.

## Install the adapter

The current adapter supports Fastify `^5.12.1`.

<!-- docs:package-manager -->

```sh
# Bun
bun add @hulla/api @hulla/api-fastify fastify zod

# npm
npm install @hulla/api @hulla/api-fastify fastify zod

# pnpm
pnpm add @hulla/api @hulla/api-fastify fastify zod

# Yarn
yarn add @hulla/api @hulla/api-fastify fastify zod
```

## Mount a route and verify it

Declare the HTTP boundary in a module shared by server and client code:

```ts
// src/api/contract.ts
import { defineContract, request, response, route } from '@hulla/api'
import { z } from 'zod'

export const contract = defineContract({
  basePath: '/api',
  routes: {
    greet: route.post('/greetings', {
      body: request.json(
        z.object({ name: z.string().min(1) })
      ),
      responses: {
        200: response.json(
          z.object({ message: z.string() })
        ),
      },
    }),
  },
})
```

Implement the route in server-only code:

```ts
// src/api/server.ts
import { defineServer } from '@hulla/api/server'
import { contract } from './contract'

export const implementation = defineServer(contract).implement({
  greet: ({ body, response }) =>
    response(200, {
      message: 'Hello, ' + body.name,
    }),
})
```

Create the Fastify app and mount the implementation before the app becomes ready:

```ts
// src/app.ts
import { fastifyAdapter } from '@hulla/api-fastify'
import Fastify from 'fastify'
import { implementation } from './api/server'

export const app = Fastify()

const adapter = fastifyAdapter(app)
adapter.mount(implementation)
```

`mount()` registers every selected contract route through Fastify's native `app.route()` API and returns that same
`app`. Verify the integration without opening a network port by using Fastify's native injection API:

```ts
// scripts/verify-api.ts
import { app } from '../src/app'

const result = await app.inject({
  method: 'POST',
  url: '/api/greetings',
  payload: { name: 'Ada' },
})

console.log(result.statusCode) // 200
console.log(result.json()) // { message: 'Hello, Ada' }

await app.close()
```

`inject()` boots the Fastify plugin tree and dispatches through its router and hooks. In the production entry point,
start the same app normally:

```ts
import { app } from './app'

await app.listen({ host: '127.0.0.1', port: 3000 })
```

## Mount in the right plugin scope

> Mount on the `FastifyInstance` that owns the routes' prefix, hooks, and decorators. Root and plugin instances are
> different encapsulation scopes.

Mount on the root app when the contract routes should share root-level behavior. Mount inside `register()` when only
one route group should receive a plugin prefix or scoped hook:

```ts
import { fastifyAdapter } from '@hulla/api-fastify'
import { userFragment } from './api/users'
import { requireUser } from './hooks/require-user'

app.register(
  async (instance) => {
    instance.addHook('preHandler', requireUser)
    fastifyAdapter(instance).mount(userFragment)
  },
  { prefix: '/account' }
)
```

The fragment's contract paths are registered below `/account`, and `requireUser` runs only in that plugin scope.
Mounting the same fragment on the parent app would not inherit child-plugin behavior. Register plugins and routes
before `app.ready()`, `app.inject()`, or `app.listen()` boots the application.

See [server fragments and composition](./server-composition.md) for creating `userFragment`.

## Understand the Fastify request lifecycle

For a matched contract route:

1. Fastify applies the route's plugin scope and runs its early lifecycle hooks.
2. Fastify parses path parameters, query values, headers, and the request body.
3. The adapter validates those values against the contract.
4. `@hulla/api` creates server context, runs its middleware, and calls the handler.
5. The adapter sends the declared result through `reply`, so Fastify response hooks still run.

Native Fastify routes can live beside mounted contract routes. Custom contract `QUERY` routes also use Fastify's
router.

> Contract schemas are not copied into Fastify route `schema` objects. Fastify parses the request first;
> `@hulla/api` performs contract validation inside the registered handler.

Use contract schemas as the shared server/client boundary. Configure Fastify route schemas separately only for native
routes that Fastify itself validates and serializes.

## Configure body parsers in Fastify

The adapter reads the parsed value from `request.body`; it does not read the raw Node stream as a fallback.

| Contract body | Fastify setup | Value expected by the adapter |
| --- | --- | --- |
| JSON | Built-in `application/json` parser | Parsed JSON value |
| Text | Built-in `text/plain` parser | String |
| Bytes | Matching custom content-type parser | `Uint8Array` or Node `Buffer` |
| Form data | Multipart plugin plus application mapping | Web `FormData` |

For example, configure an octet-stream parser before mounting a byte route:

```ts
app.addContentTypeParser(
  'application/octet-stream',
  { parseAs: 'buffer' },
  (_request, body, done) => done(null, body)
)
```

Fastify owns `bodyLimit`, unsupported content types, and parser failures. Those failures happen before the adapter
handler and follow Fastify's error pipeline. If a parser runs but supplies no body for a contract that requires one,
the adapter returns an `invalid-request-body` problem.

Many multipart plugins expose fields and files in their own shape. Convert that result to a native `FormData` before
a `request.formData()` contract route reaches the adapter.

## Add Fastify state to server context

Keep the context factory portable when it only needs application services or route metadata. When handlers need
Fastify's native request, reply, logger, ID, or decorations, replace the portable app setup with a Fastify-bound
context:

```ts
import { defineServer } from '@hulla/api/server'
import { fastifyAdapter } from '@hulla/api-fastify'
import Fastify from 'fastify'
import { contract } from './api/contract'

const app = Fastify()
const adapter = fastifyAdapter(app)

const implementation = defineServer(contract, {
  context: adapter.context(({ request, reply, route }) => {
    reply.header('x-request-id', request.id)
    return {
      logger: request.log,
      requestId: request.id,
      routeKey: route.key.join('.'),
    }
  }),
}).implement({
  greet: ({ body, context, response }) => {
    context.logger.info(
      { requestId: context.requestId, route: context.routeKey },
      'Greeting request'
    )
    return response(200, { message: 'Hello, ' + body.name })
  },
})

adapter.mount(implementation)
```

Fastify decorations remain available through the framework's TypeScript declaration merging. `adapter.context()`
binds this implementation to Fastify, so mounting it through another adapter fails immediately. Context code may
inspect `reply` or set headers on it, but it should not send a second response; return the declared result from the
route handler.

## Separate adapter errors from Fastify errors

Use `onError` for failures while `@hulla/api` decodes contract inputs, creates context, runs middleware or the
handler, and serializes the declared response:

```ts
const adapter = fastifyAdapter(app, {
  onError({ error, phase, request, defaultResponse }) {
    request.log.error({ error, phase }, 'API request failed')
    return defaultResponse
  },
})
```

The hook receives the native Fastify request and reply plus a protocol-safe adapter response. Return another adapter
response to replace the fallback, or return `undefined` to keep it. Options passed to `mount()` override the adapter
defaults for that mount; `onError: undefined` disables an inherited hook.

Fastify owns failures before or after that boundary:

- content-type parser and early-hook failures follow Fastify's error handler;
- errors while the adapter converts its result for `reply.send()` follow Fastify's handler;
- stream failures after sending begins propagate through Fastify's response pipeline.

## Handle streams and disconnects

Declared stream bodies must be iterable or async iterable and yield `Uint8Array` chunks. The adapter wraps the source
in a Web `ReadableStream` for `reply.send()` without first collecting every chunk.

The handler's `signal` aborts when the request is aborted or the response closes early. A stream cancellation also
calls the source iterator's `return()` method. Use that signal and iterator cleanup to stop database, file, or network
work when the client disconnects.

## Next steps

- [Server context and middleware](./server-context.md) explains portable context and route policies.
- [Server fragments and composition](./server-composition.md) shows how to build plugin-owned route groups.
- [Typed clients](./client-authoring.md) calls the same contract from a browser or another service.
- [Fastify documentation](https://fastify.dev/docs/latest/) covers plugins, hooks, parsers, and deployment.
