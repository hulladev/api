# Express

`@hulla/api-express` attaches a complete server implementation or deployable fragment to an existing Express app or
`Router`. It never creates an Express application.

```ts
import express from 'express'
import { register } from '@hulla/api-express'
import { implementation } from './api/server'

const app = express()

app.use(express.json())
register(app, implementation)
app.listen(3000)
```

Each selected contract route is registered with its exact HTTP method and path. A fragment therefore scopes
registration naturally:

```ts
const users = server.implement(contract.routes.users, userHandlers)
const usersRouter = express.Router()

usersRouter.use(requireUser)
usersRouter.use(rateLimit())
register(usersRouter, users)
app.use(usersRouter)
```

There is no separate route-descriptor API. Pass either a fragment or a complete implementation to `register()`.
Express middleware stays in Express: use `app.use()` globally or a dedicated `Router` when it should apply only to a
fragment.

## Middleware order

Express middleware composes normally because the adapter registers native Express route handlers. Registration order
is execution order:

```ts
app.use(cors())
app.use(express.json())
app.use(authenticate)

register(app, implementation)

app.use(expressErrorHandler)
```

For a matching route, execution proceeds as follows:

1. Express middleware registered before `register()` runs, including CORS, body parsing, and authentication.
2. The adapter reads native Express params, query, headers, and parsed body values and decodes the declared contract input.
3. The Hulla context factory, Hulla middleware, and route implementation run.
4. The adapter writes the result through the Express response.

An ordinary Express middleware registered after the routes does not run after a successful response. Express error
middleware placed there receives adapter transport failures through `next(error)`. Unmatched requests continue to
later Express routes and middleware.

The adapter reuses `req.params`, `req.query`, `req.headers`, and a body parsed by earlier Express middleware directly.
Install the parser matching each contract representation before `register()`: `express.json()` for JSON,
`express.text()` for text, `express.raw()` for bytes, and an application-selected multipart parser for form data. Hulla
does not buffer or parse the underlying Node stream as a fallback; this keeps body limits, content-type selection, and
parser errors under Express's native middleware policy. A missing parser produces an `invalid-request-body` response,
and its setup error is available to `onError`. Responses use Express's native status, header, JSON, send, and streaming
APIs with backpressure.

## Express state in Hulla context

Portable handlers do not receive a Fetch-shaped request. Declare `expressAdapter()` when context construction needs
Express state installed by earlier middleware, such as Passport's `user`, session data, or `res.locals`:

```ts
import express from 'express'
import { expressAdapter, register } from '@hulla/api-express'
import { defineServer } from '@hulla/api/server'

const app = express()

const server = defineServer(contract, {
  adapter: expressAdapter<{ tenant: string }>(),
  context: ({ request, response, locals, route }) => ({
    route,
    user: request.user,
    tenant: locals.tenant,
    requestId: response.getHeader('x-request-id'),
  }),
})

const implementation = server.implement(handlers)
register(app, implementation)
```

Inside the factory:

- `request` is Express's native `Request`, including declaration-merging additions from middleware packages.
- `response` is Express's native `Response`.
- `locals` is the current `res.locals` object. Supply its object type to `expressAdapter<Locals>()`; omit the type when
  custom locals typing is unnecessary.

`expressAdapter()` declares the implementation's native context requirement; it is not attached to an app or router.
`register()` alone performs route registration. Hulla still owns the declared response write, so context code should not
independently finish the response.

That context factory is bound to the Express adapter. Registering it through Next.js, the generic Fetch adapter, or
`inProcessTransport()` fails immediately instead of passing an incompatible request object. Use an ordinary portable
context factory when it needs only Hulla route metadata or request-independent services.

The optional third argument is reserved for adapter transport behavior, such as the lower-level runtime error hook. It
does not introduce another middleware system:

```ts
register(app, implementation, {
  onError({ error, phase, request, response, locals, defaultResponse }) {
    console.error(phase, request.originalUrl, response.statusCode, locals, error)
    return defaultResponse
  },
})
```

The hook receives the native Express request, response, and `res.locals` in the same input object as the portable error
fields. Returning `undefined` keeps the default response. Errors raised while Express reads or writes the transport are
passed to the next Express error handler.
