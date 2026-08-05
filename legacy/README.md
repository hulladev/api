# @hulla/api

<a href="https://pkg-size.dev/@hulla/api"><img src="https://pkg-size.dev/badge/bundle/2038" title="Bundle size for @hulla/api"></a>
<a href="https://github.com/hulladev/api/actions/workflows/check.yml"><img src="https://github.com/hulladev/api/actions/workflows/check.yml/badge.svg" title="Passing tests"></a>

Stop rewriting the same API contract in five different places. `@hulla/api` keeps the handler, runtime validation, HTTP route, client types, and framework integration attached to one procedure tree.

Write procedures by hand, generate them from Drizzle, or mix both. The database stays on the server. The browser gets a small typed client.

## About

What is `@hulla/api`? A tiny API toolkit for TypeScript 🚀

- Generate end-to-end typed HTTP routes from Drizzle tables ⚡
- Keep database clients and server handlers out of browser bundles 🔒
- Organize API, server action, database, queue, or local calls in one typed place ✅
- Run the same procedure contract through Fetch, Bun, Deno, Hono, Elysia, Next, Express, or Nest 💎
- Add TanStack Query, SWR, or third-party helpers without fighting over method names 🧩
- Consume existing OpenAPI contracts when the API already lives elsewhere 🌍

There is no required framework and no database runtime pretending it can execute in the browser.

## Install

```bash
pnpm add @hulla/api
# works also with bun, yarn, npm, deno, etc...
```

Pick the packages your app needs:

```bash
pnpm add @hulla/api-drizzle  # drizzle -> server procedures + browser client
pnpm add @hulla/api-tanstack-query # tanstack query helpers
pnpm add @hulla/api-tanstack-db # tanstack db collection builders
pnpm add @hulla/api-swr      # swr helpers
pnpm add @hulla/api-openapi  # openapi/swagger -> typed api client
pnpm add @hulla/api-express  # express transport adapter
```

## Drizzle API

The shortest path is to let Drizzle describe the boring parts without letting it decide what every user may do.

Starting fresh? `hulla api init` previews a minimal config without writing anything. It includes the Drizzle source when the Drizzle integration and config are already present; add `--write` when the proposal looks right.

Put tables that are safe to expose below an `api/` directory. This is an exposure boundary in your source tree, not a forced URL layout:

```ts
// src/db/schema/api/todos.ts
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { z } from 'zod'
import { defineTable } from '@hulla/api-drizzle'

export const todosTable = sqliteTable('todos', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  title: text('title').notNull(),
  completed: integer('completed', { mode: 'boolean' }).notNull().default(false),
  archivedAt: integer('archived_at', { mode: 'timestamp' }),
})

export const todos = defineTable(todosTable, {
  schemas: {
    insert: z.object({
      id: z.string().optional(),
      title: z.string().min(1),
      completed: z.boolean().optional(),
    }),
    update: z.object({
      title: z.string().min(1).optional(),
      completed: z.boolean().optional(),
    }),
    key: z.string(),
  },
  archive: 'archivedAt',
})
```

`defineTable()` associates validation and table-level behavior once. Its schemas are equally useful in an internal procedure, a handwritten route, or generated CRUD. It does not expose anything and it does not control which columns a route returns.

Drizzle's native Zod integration supplies defaults when it is available. Supplying schemas explicitly remains useful for product rules such as minimum lengths. `insert` alone controls create input and `update` alone controls update input.

### Choose what becomes public

The normal path is one router per public resource:

```ts
// src/api/todos.router.ts
import { crud } from '@hulla/api-drizzle'
import { api } from './api'
import { todos, todosTable } from '../db/schema/api/todos'

const publicTodo = {
  id: todosTable.id,
  title: todosTable.title,
  completed: todosTable.completed,
}

export const todosRouter = api
  .router('todos')
  .use('session')
  .define(crud(todos, { select: publicTodo }))
```

That one line gives the router `list`, `get`, `create`, `update`, `delete`, and—because this table archives—`restore`. `select` is a real Drizzle partial selection. It controls SQL selection, mutation returning values, and public output types. It never changes the insert or update input.

Generated CRUD is an authorization decision. Shared middleware can require a session, but ownership filters still belong in a custom handler or database RLS.

Presets are ordinary core routes, so replacing one generated handler does not require giving up the rest:

```ts
export const todosRouter = api.router('todos').define(
  crud(todos, { select: publicTodo }),
  ({ route, generated }) => ({
    ...generated,

    list: route('GET', '/')
      .output(todoPublicSchema.array())
      .handler(async ({ getContext }) => {
        const { session } = await getContext()
        return db.select(publicTodo).from(todosTable).where(eq(todosTable.ownerId, session.userId))
      }),
  })
)
```

The callback returns the complete router. Spread, replace, rename, or omit generated members there; nothing is hidden in a second naming configuration.

For a smaller route tweak, map canonical operations while keeping their generated handlers:

```ts
crud(todos, {
  routes: {
    list: { method: 'QUERY', path: '/' },
    restore: false,
  },
})
```

Archived tables keep `.delete()` by default, but delete archives rather than hard-deleting. Reads exclude archived rows, ordinary writes cannot set the marker, and restore clears it. No hard-delete escape hatch is generated.

### Bulk generation

For trusted internal tools or fast prototypes, bulk exposure is available—but deliberately opt-in. Tables beneath an `api/` directory are discovered from the nearest Drizzle config; tables elsewhere remain internal.

```ts
// api.config.ts
import { generate } from '@hulla/api'
import { zodWireSchemaConverter } from '@hulla/api/zod'
import { fromDrizzle } from '@hulla/api-drizzle/config'
import { tanstackQueryPlugin } from '@hulla/api-tanstack-query'

export default generate({
  schemaConverters: [zodWireSchemaConverter()],
  sources: [
    fromDrizzle({
      routes: 'all',
      plugins: [tanstackQueryPlugin()],
    }),
  ],
  output: {
    dir: './src/api/generated',
    entry: './src/api/client.ts',
  },
})
```

Generate once, or keep generation running beside the dev server:

```bash
hulla api generate
hulla api dev
```

### Server

Generation cannot guess which database instance, middleware, or authorization rules your process should use. Supply those on the server:

```ts
// src/api/api.ts
import { createApi } from '@hulla/api'
import { drizzlePlugin } from '@hulla/api-drizzle'
import { db } from '../db'

export const api = createApi({
  plugins: [drizzlePlugin({ db })],
  middleware: {
    session: () => getSession(),
  },
})
```

```ts
// src/api/server.ts
import { createApiHandler } from '@hulla/api/server'
import { api } from './api'
import { contracts, createDrizzleRouters } from './generated/server'

const generated = createDrizzleRouters({ api: api.use('session') })

export const handler = createApiHandler({
  routers: generated,
  contract: contracts.drizzle,
})
```

The generated server artifact imports Drizzle and your tables. The browser entrypoint does not import validators, handlers, tables, Drizzle, or the database. Its input and output stubs are derived from the generated HTTP contract, so the browser client can live in a separate repository without resolving backend source files.

### Client

The client looks like the procedure tree, without REST-shaped `{ body, params }` wrappers:

```ts
import { createClient } from './api/client'

const client = createClient()

const todos = await client.todos.list()
const todo = await client.todos.create({ title: 'Ship it' })

await client.todos.update(todo.id, { completed: true })

await client.todos.get(todo.id)
await client.todos.delete(todo.id)
await client.todos.restore(todo.id)
```

Generated modules export the `createClient()` factory rather than a preconfigured `api` singleton. Applications own
the client instance, transport options, headers, and lifetime; callable procedures always live directly on that client.

Headers may be resolved for each request, which keeps rotating session credentials out of a stale singleton. Every generated procedure also exposes `.request(...)` for cancellation and one-off headers without changing its normal call signature:

```ts
const client = createClient({
  headers: () => ({ authorization: `Bearer ${session.accessToken}` }),
})

const controller = new AbortController()
await client.todos.get.request(
  { signal: controller.signal, headers: { 'x-trace-id': traceId } },
  todo.id
)
```

## Procedures and Routes

Generation is optional. A procedure is server-internal until you deliberately turn it into a route.

```ts
import { createApi } from '@hulla/api'
import { z } from 'zod'

const api = createApi()

export const math = api.router('math').define(({ procedure, route }) => ({
  double: procedure
    .input(z.number())
    .output(z.number())
    .handler(({ input }) => input * 2),

  publicDouble: route('POST', '/double')
    .input(z.number())
    .output(z.number())
    .handler(({ input }) => input * 2),
}))

await math.double(21) // 42
```

Both procedures can be called locally. Only `publicDouble` is dispatched over HTTP or emitted into the browser client. There is no `.route()` hanging off finalized client procedures, so frontend autocomplete only shows what the client can actually do.

Schemas parse at runtime and carry their inferred types into the procedure call signature, plugins, and generated contracts.

Route method and path literals are preserved in `.$meta.route`. A parameterized path cannot be finalized until its input can supply every parameter, so mistakes are reported next to the route definition:

```ts
route('GET', '/:organizationId/:memberId')
  .input(z.object({ organizationId: z.string() }))
  .handler(() => null)
// TypeScript error: the input does not supply memberId
```

Pass more than one schema to define positional inputs. The handler receives the parsed values as a tuple:

```ts
const rename = procedure
  .input(z.string(), z.object({ name: z.string() }))
  .handler(({ input: [id, patch] }) => updateUser(id, patch))

await rename('user_123', { name: 'Samuel' })
```

A trailing schema whose input includes `undefined` becomes an optional call argument. Optional inputs before a required input still need an explicit positional value (usually `undefined`).

When declaration parameter names matter, use a labeled schema tuple. Mark trailing optional positions explicitly so TypeScript can preserve their labels:

```ts
const idSchema = z.string()
const patchSchema = z.object({ name: z.string() })

const rename = procedure.input
  .$named<[id: typeof idSchema, patch: typeof patchSchema]>(idSchema, patchSchema)
  .handler(({ input: [id, patch] }) => updateUser(id, patch))
```

```ts
math.double(null)
// TS error: expected type 'number', got 'null'
// Runtime validation error if untyped input reaches the procedure
```

Finalized procedures also carry stable keys:

```ts
math.double.$key.root // "math/double"
math.double.$key.full(21) // ["math/double", 21]
```

The handler can call a database, another service, a queue, a server action, or plain TypeScript. The procedure does not care.

## Middleware

Declare context factories once and select them where they apply:

```ts
type Session = { userId: string }

const api = createApi({
  middleware: {
    session: () => getSession() as Promise<Session>,
  },
})

export const publicApi = api
export const protectedApi = api.use('session')

export const account = protectedApi.router('account').define(({ procedure }) => ({
  me: procedure.handler(async ({ getContext }) => {
    const { session } = await getContext()

    return { id: session.userId }
  }),
}))
```

Middleware factories run for every selected procedure call. They can use the application's existing session, request
scope, database, or other runtime integrations without coupling the procedure to a transport.

API-level middleware flows into every router and procedure created from the scoped builder. Router and procedure `.use(...)` can add narrower context without running duplicate middleware twice.

Authorization belongs here, in database RLS, or both. Generated CRUD does not invent authorization rules for you.

## HTTP Transport

`@hulla/api/server` exposes one Fetch-compatible dispatcher. Router names become URL segments and every route keeps the HTTP method and relative path you chose:

```text
GET    /api/todos
GET    /api/todos/:id
POST   /api/todos
PATCH  /api/todos/:id
DELETE /api/todos/:id
```

Path parameters use ordinary readable URL segments. Remaining `GET` and `HEAD` fields use standard query parameters; other methods send a standard JSON body. Positional inputs map path parameters first and then place the remaining argument in the query or body, so `update(id, patch)` becomes `PATCH /todos/:id` with `patch` as JSON.

If a copied resource identifier appears in more than one HTTP location, equivalent values are deduplicated and the path remains authoritative. Conflicting values return `409 INPUT_CONFLICT` instead of silently targeting a different resource.

Generation writes a versioned HTTP wire contract used by both the browser transport and server handler. It deterministically describes strings, numbers, booleans, dates, bigints, bytes, arrays, and objects before the validation schema runs once. This keeps generated calls typed without putting Hulla serialization tags in URLs. Plain HTTP clients can call the same endpoints without protocol-specific envelopes or headers.

Handwritten Zod routers opt into schema derivation in the generation config:

```ts
import { generate } from '@hulla/api'
import { zodWireSchemaConverter } from '@hulla/api/zod'

export default generate({
  schemaConverters: [zodWireSchemaConverter()],
  output: { dir: './src/api/generated' },
})
```

Opaque custom schemas can keep their original validation and TypeScript types while declaring only their transport representation with `httpWire(schema, descriptor)`. Unsupported transforms and ambiguous unions fail generation with an actionable annotation example.

The configured output directory is generator-owned and contains `.hulla/manifest.json`. Generation refuses to replace the project root, paths outside the project, symbolic links, or non-empty directories without that marker. When adopting this release with an older generated directory, review and remove or move that directory once before regenerating it.

Successful values are standard JSON, `undefined` returns 204, and structured response bodies are reserved for errors. Dates use ISO strings, bigints use decimal strings, and bytes use base64 strings; generated browser types reflect those JSON representations. Request IDs travel in headers without requiring a proprietary protocol marker.

Non-empty request bodies must use `application/json` or an `application/*+json` media type. The dispatcher maps routing, decoding, and input-validation failures, but lets middleware, handlers, output validation, encoding, aborted reads, and other application failures propagate to the host. Configure request-size limits, logging, error responses, rate limits, and cross-origin policy in the server or proxy that owns those concerns.

Generated handlers mount their contract explicitly; the contract owns its base path. Combining `contract` and `basePath` is an error. A handler mounted without a contract defaults to `/api` and intentionally passes raw URL strings and ordinary parsed JSON to its schemas without type guessing:

```ts
export const handler = createApiHandler({
  routers: [todosRouter],
  basePath: '/v1',
})
```

`@hulla/api/client` exposes the matching low-level transport when you need to build a custom client:

```ts
import { createHttpTransport } from '@hulla/api/client'

const transport = createHttpTransport({
  baseUrl: 'https://example.com/api',
  headers: { authorization: 'Bearer token' },
})

await transport.call({ method: 'POST', path: '/math/double' }, 21)

const controller = new AbortController()
await transport.request(
  { method: 'POST', path: '/math/double' },
  { signal: controller.signal, headers: { 'x-trace-id': traceId } },
  21
)
```

Transport failures use a typed error with the status, request ID, stable error code, response, and parsed body:

```ts
import { isHullaAPIError } from '@hulla/api/client'

try {
  await client.todos.get('missing')
} catch (error) {
  if (isHullaAPIError(error, 'NOT_FOUND')) {
    console.error(error.status, error.requestId, error.body.message)
  }
}
```

## Frameworks

The handler speaks Fetch, so Bun and Deno need no adapter:

```ts
Bun.serve({ fetch: handler.fetch })
Deno.serve(handler.fetch)
```

Hono and Elysia can forward their request directly:

```ts
app.all('/api/*', (context) => handler.fetch(context.req.raw)) // Hono
app.all('/api/*', ({ request }) => handler.fetch(request)) // Elysia
```

Express and Nest's default Express platform use the Express transport adapter:

```ts
import { createExpressMiddleware } from '@hulla/api-express'

app.use(createExpressMiddleware(handler))
```

```ts
import { createExpressMiddleware } from '@hulla/api-express'

consumer.apply(createExpressMiddleware(handler)).forRoutes('*')
```

Next App Router forwards each supported method from a catch-all route:

```ts
// app/api/[[...hulla]]/route.ts
import { handler } from '../../../src/api/server'

export const GET = handler.fetch
export const POST = handler.fetch
export const PUT = handler.fetch
export const PATCH = handler.fetch
export const DELETE = handler.fetch
export const HEAD = handler.fetch
export const OPTIONS = handler.fetch
```

Adapters only translate transport details. Procedure behavior stays in the router. Next App Router cannot represent `QUERY`, so generation rejects that combination rather than silently changing its method.

## Plugins

Plugin namespaces are exposed with a framework-owned `$` prefix, which makes integrations visually distinct from user
procedures. Distinct stable plugin identities may share one namespace, so TanStack Query and TanStack DB can contribute
separate leaves directly under `.$tanstack`.

Plugin authors can import the compact, contextually typed authoring surface from `@hulla/api/plugin`:

```ts
import { definePlugin } from '@hulla/api/plugin'

export const timingPlugin = definePlugin({
  id: 'timing',
  procedure({ meta }) {
    return { route: meta.route }
  },
})
```

### TanStack Query

```ts
import { tanstackQueryPlugin } from '@hulla/api-tanstack-query'

const api = createApi({ plugins: [tanstackQueryPlugin()] })

const users = api.router('users').define(({ procedure }) => ({
  list: procedure.handler(() => getUsers()),
  byId: procedure.input(z.string()).handler(({ input }) => getUser(input)),
  create: procedure.input(createUserSchema).handler(({ input }) => createUser(input)),
}))

const listOptions = users.list.$tanstack.queryOptions()
const userOptions = users.byId.$tanstack.queryOptions('user_123')
const createOptions = users.create.$tanstack.mutationOptions()

// useQuery(listOptions)
// useQuery(userOptions)
// useMutation(createOptions)
```

Input procedures require their input when building query options. This keeps the query key and query function bound to the same value. TanStack Query forwards its cancellation signal through generated clients automatically.

Use a different visible namespace when a project prefers a shorter name. The stable identity does not change:

```ts
const api = createApi({
  plugins: [tanstackQueryPlugin({ namespace: 'rq' })],
})

const rqUsers = api.router('users').define(({ procedure }) => ({
  list: procedure.handler(() => getUsers()),
}))

rqUsers.list.$rq.queryOptions()
```

### TanStack DB

TanStack DB integration produces collection configuration; it does not wrap or replace the collection's `insert`,
`update`, or `delete` methods.

```ts
import { createCollection } from '@tanstack/react-db'
import { tanstackDbPlugin } from '@hulla/api-tanstack-db'

const api = createApi({ plugins: [tanstackDbPlugin()] })
const users = api.router('users').define(({ procedure }) => ({
  list: procedure.handler(() => getUsers()),
}))

const usersCollection = createCollection<User>(
  users.list.$tanstack.collectionOptions({
    queryClient,
    getKey: (user) => user.id,
  })
)
```

Generated Drizzle CRUD routers can provide all persistence handlers at once. Server-assigned IDs use the generated
`create` helper, while `collection.insert()` remains available for models whose IDs are assigned by the client.

```ts
import { crudCollectionOptions } from '@hulla/api-tanstack-db'

const todosOptions = crudCollectionOptions({
  routes: client.todos,
  key: 'id',
  queryClient,
})
const todosCollection = createCollection(todosOptions)

// The backend assigns the id and the canonical returned row is written to the collection.
await todosOptions.create({ title: 'Ship it', completed: false })
```

When client generation sees `tanstackDbPlugin()` on a Drizzle source or a local `crud(table)` router, it also emits
ready-to-use collection definitions. The Drizzle table supplies the collection key automatically, including the alias
when a custom selection renames the primary-key column. The application creates one client runtime with its query
client and may override any non-structural collection option:

```ts
import { createClient } from './api/generated'

const client = createClient({
  queryClient,
  collections: {
    todos: {
      staleTime: 30_000,
      refetch: true,
    },
  },
})

await client.todos.$tanstack.collection.create({ title: 'Ship it', completed: false })
client.todos.$tanstack.collection.update(todoId, (draft) => {
  draft.completed = true
})
```

When collection generation is enabled, `queryClient` is a required `createClient()` option. Generated clients without
collections keep optional transport options and can be created with `createClient()`.

Collections are created lazily on first access and remain stable for the lifetime of the client. Call `client.$dispose()`
when an SSR request, test, authenticated session, or other explicit runtime scope ends. `createCollectionOptions({ client,
queryClient, overrides })` remains available for projects that want to construct, extend, or replace the final
collection themselves. No collection configuration is needed for Drizzle CRUD presets:

```ts
// src/api/todos.router.ts — server source; never imported by the browser
const api = createApi({
  plugins: [drizzlePlugin({ db }), tanstackDbPlugin()],
})

export const todos = api.router('todos').define(crud(todosTable))
```

`drizzlePlugin({ db })` is marked server-only. Generation reads this module in the build process, but the emitted browser
client excludes the Drizzle plugin, Drizzle ORM, table modules, and database instance. Only browser-safe plugins such as
`tanstackDbPlugin()` are recreated in the generated client.

Ordinary hand-written CRUD routers still opt in with an explicit key because they do not carry table metadata:

```ts
tanstackDbPlugin({
  collections: {
    todos: 'id',
  },
})
```

### SWR

Query and SWR can coexist because neither claims root-level `.query` or `.mutation` members:

```ts
import { tanstackQueryPlugin } from '@hulla/api-tanstack-query'
import { swrPlugin } from '@hulla/api-swr'

const api = createApi({
  plugins: [tanstackQueryPlugin(), swrPlugin()],
})

const users = api.router('users').define(({ procedure }) => ({
  list: procedure.handler(() => getUsers()),
}))

users.list.$tanstack.queryOptions()
users.list.$swr.queryOptions()
```

Official and third-party plugins use the same `definePlugin(...)` declaration. A plugin instance carries its identity, runtime hooks, type hooks, aliases, injection defaults, and generation metadata. Generated clients reconstruct direct imports when that metadata is serializable.

Plugin identities cannot collide with another plugin. Visible `$meta` and `$key` namespaces are reserved by the core,
and configured namespaces omit the framework-owned `$` prefix.

## OpenAPI

Not every API starts in this repository. `@hulla/api-openapi` turns an existing OpenAPI or Swagger document into an `@hulla/api` client factory while keeping external OpenAPI consumption independent from Drizzle generation.

```bash
bunx @hulla/api-openapi ./openapi.json --output ./src/api.generated.ts
```

```ts
import { createOpenAPIClient } from './api.generated'

const client = createOpenAPIClient((request) => {
  return fetch(request.path, {
    method: request.method,
    body: request.body === undefined ? undefined : JSON.stringify(request.body),
  }).then((response) => response.json())
})

await client.users.getUsersId({
  params: { id: 'user_123' },
})
```

OpenAPI sources can use the same direct plugin instances as generated Drizzle clients.

## CLI

Generation stays under the main Hulla CLI:

```bash
hulla api init
hulla api generate
hulla api dev
```

`hulla api` is the short form of `hulla api generate`. Use `--config` for a nonstandard config name and `--cwd` when invoking the CLI outside the project directory.

- `init` previews a minimal config and never writes unless `--write` is present. It detects an installed Hulla Drizzle integration and existing Drizzle config.
- `generate` loads the source graph from `api.config.ts` and publishes output atomically.
- `dev` reloads the config when declared source inputs change, ignores generated output, and keeps the last successful output available after an error.

Initialization never moves schema files or overwrites an existing config. Run `hulla api --help` for the complete command surface.

The default base path and generated scaffold are `/api`, but neither forces routes below `/api/hulla` or any other extra prefix.

## Output Parsing

Output schemas parse awaited handler values by default, so async handlers work with ordinary schemas:

```ts
const user = api.procedure.output(z.string()).handler(async () => 'Samuel')

await user() // "Samuel"
```

Use raw parsing only when a schema genuinely needs to inspect the unawaited return value:

```ts
const api = createApi({
  settings: {
    output: 'raw',
  },
})
```

## Examples

- [`examples/client-only`](./examples/client-only) wraps an existing transport with validated procedures and demonstrates the namespaced TanStack Query and SWR plugin helpers.
- [`examples/server-only`](./examples/server-only) demonstrates internal procedures, public HTTP routes, request middleware, and the Fetch-compatible server handler.
- [`examples/interactive`](./examples/interactive) is a live backend + web walkthrough of vanilla RPC, TanStack Query, and TanStack DB, with actual request telemetry and generation directly into the web app.
- [`examples/monorepo`](./examples/monorepo) runs the complete generated-contract path with Hono, SQLite, Drizzle, TanStack Start, TanStack DB, and Expo.

Every example has a network-free smoke check:

```bash
bun run --cwd examples/client-only check
bun run --cwd examples/server-only check
bun run --cwd examples/interactive check
bun run --cwd examples/monorepo check
```

## Development

- Install dependencies with `bun install`
- Run the complete repository and generated-example check with `bun run check`
- `bun run lint` and `bun run fmt` are check-only; use `bun run lint:fix` and `bun run fmt:fix` to apply fixes
