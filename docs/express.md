# Express

`@hulla/api-express` attaches a complete server implementation or deployable fragment to an existing Express app or
`Router`. It never creates an Express application.

## Prerequisites

This guide starts at the adapter boundary. First define the shared contract from
[contract authoring](./contract-authoring.md), then turn it into the server value mounted below:

```ts
// src/api/server.ts
import { defineServer } from '@hulla/api/server'
import { contract } from './contract'

const server = defineServer(contract)

export const implementation = server.implement({
  health: ({ response }) => response(200, 'ok'),
  users: {
    byId: ({ params, response }) => response(200, { id: params.id, name: 'Ada' }),
    rename: ({ params, body, response }) => response(200, { id: params.id, name: body.name }),
  },
})
```

`defineServer(contract)` creates the server authoring scope. `implement()` requires the handler tree to cover the
contract and returns the complete `implementation` accepted by `mount()`. See
[server authoring](./server-authoring.md) for context, middleware, declared errors, and independently deployable
fragments.

## Mount on Express

```ts
import express from 'express'
import { expressAdapter } from '@hulla/api-express'
import { implementation } from './api/server'

const app = express()
const adapter = expressAdapter(app)
const host = process.env.HOST ?? '127.0.0.1'
const preferredPort = Number(process.env.PORT ?? 43187)

app.use(express.json())
adapter.mount(implementation)

function listen(port: number): void {
  const server = app.listen(port, host, () => {
    const address = server.address()
    if (address !== null && typeof address !== 'string') {
      console.log(`Listening on http://${host}:${address.port}`)
    }
  })

  server.once('error', (error) => {
    if ((error as NodeJS.ErrnoException).code === 'EADDRINUSE' && port !== 0) {
      console.warn(`Port ${port} is occupied; selecting an available port instead`)
      listen(0)
      return
    }

    throw error
  })
}

listen(preferredPort)
```

The explicit IPv4 loopback address avoids `localhost` resolving differently across machines. Port `43187` is the
development default, while `HOST` and `PORT` can override either value. If the requested port is occupied, passing
port `0` lets the operating system select a free ephemeral port atomically; the logged URL reports the actual port.

Each selected contract route is registered with its exact HTTP method and path. A fragment therefore scopes
registration naturally:

```ts
const users = server.implement(contract.routes.users, userHandlers)
const usersRouter = express.Router()
const usersAdapter = expressAdapter(usersRouter)

usersRouter.use(requireUser)
usersRouter.use(rateLimit())
usersAdapter.mount(users)
app.use(usersRouter)
```

There is no separate route-descriptor API. Pass either a fragment or a complete implementation to `mount()`.
Express middleware stays in Express: use `app.use()` globally or a dedicated `Router` when it should apply only to a
fragment.

## Client consumption

Express only hosts the server implementation. A browser, mobile application, or another service consumes the contract
through the ordinary typed Fetch client:

```ts
import { defineClient } from '@hulla/api/client'
import { fetchTransport } from '@hulla/api/fetch'
import { contract } from './api/contract'

export const api = defineClient(contract, {
  transport: fetchTransport({ baseUrl: 'https://api.example.com' }),
}).create()

export async function getUser(id: string) {
  const result = await api.users.byId({ params: { id } })

  if (result.status === 200) return result.body
  if (result.status === 404) return undefined
  throw new Error(`Could not load user: ${result.status}`)
}
```

The host framework does not change the client call surface. The returned value is a status-discriminated union, so each
declared response narrows its body and headers. Put loading state, caching, retries, and mutations in the consuming
application; see [client authoring](./client-authoring.md) and [client integrations](./plugins.md).

## Middleware order

Express middleware composes normally because the adapter registers native Express route handlers. Registration order
is execution order:

```ts
app.use(cors())
app.use(express.json())
app.use(authenticate)

adapter.mount(implementation)

app.use(expressErrorHandler)
```

For a matching route, execution proceeds as follows:

1. Express middleware registered before `mount()` runs, including CORS, body parsing, and authentication.
2. The adapter reads native Express params, query, headers, and parsed body values and decodes the declared contract input.
3. The `@hulla/api` context factory, middleware, and route implementation run.
4. The adapter writes the result through the Express response.

An ordinary Express middleware registered after the routes does not run after a successful response. Express error
middleware placed there receives adapter transport failures through `next(error)`. Unmatched requests continue to
later Express routes and middleware.

The adapter reuses `req.params`, `req.query`, `req.headers`, and a body parsed by earlier Express middleware directly.
Install the parser matching each contract representation before `mount()`: `express.json()` for JSON,
`express.text()` for text, `express.raw()` for bytes, and an application-selected multipart parser for form data. `@hulla/api`
does not buffer or parse the underlying Node stream as a fallback; this keeps body limits, content-type selection, and
parser errors under Express's native middleware policy. A missing parser produces an `invalid-request-body` response,
and its setup error is available to `onError`. Responses use Express's native status, header, JSON, send, and streaming
APIs with backpressure.

## Express state in `@hulla/api` context

Portable handlers do not receive a Fetch-shaped request. Use `expressAdapter()` when context construction needs
Express state installed by earlier middleware, such as Passport's `user`, session data, or `res.locals`:

```ts
import express from 'express'
import { expressAdapter } from '@hulla/api-express'
import { defineServer } from '@hulla/api/server'

const app = express()
const adapter = expressAdapter<{ tenant: string }>(app)

const server = defineServer(contract, {
  context: adapter.context(({ request, response, locals, route }) => ({
    route,
    user: request.user,
    tenant: locals.tenant,
    requestId: response.getHeader('x-request-id'),
  })),
})

const implementation = server.implement(handlers)
adapter.mount(implementation)
```

Inside the factory:

- `request` is Express's native `Request`, including declaration-merging additions from middleware packages.
- `response` is Express's native `Response`.
- `locals` is the current `res.locals` object. Supply its object type to `expressAdapter<Locals>()`; omit the type when
  custom locals typing is unnecessary.

`expressAdapter()` binds the caller-owned app or router once. Its `context()` method declares a native context
requirement, while `mount()` performs route registration. `@hulla/api` still owns the declared response write, so context code should not
independently finish the response.

That context factory is bound to the Express adapter. Mounting it through Next.js, the generic Fetch adapter, or
`inProcessAdapter().mount()` fails immediately instead of passing an incompatible request object. Use an ordinary portable
context factory when it needs only contract route metadata or request-independent services.

The optional second argument to `expressAdapter()` sets transport defaults shared by every fragment mounted through that
adapter. This is the natural place for a common lower-level runtime error hook; it does not introduce another middleware
system:

```ts
const adapter = expressAdapter(app, {
  onError({ error, phase, request, response, locals, defaultResponse }) {
    console.error(phase, request.originalUrl, response.statusCode, locals, error)
    return defaultResponse
  },
})

adapter.mount(implementation)
```

The hook receives the native Express request, response, and `res.locals` in the same input object as the portable error
fields. Returning `undefined` keeps the default response. Errors raised while Express reads or writes the transport are
passed to the next Express error handler.

Options passed to `mount()` shallowly override these defaults for that mount. Set `onError: undefined` there to restore
the protocol-safe default handling for one fragment.
