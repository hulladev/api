# @hulla/api

<a href="https://pkg-size.dev/@hulla/api"><img src="https://pkg-size.dev/badge/bundle/2038" title="Bundle size for @hulla/api"></a>
<a href="https://github.com/hulladev/api/actions/workflows/check.yml"><img src="https://github.com/hulladev/api/actions/workflows/check.yml/badge.svg" title="Passing tests"></a>

`@hulla/api` is a tiny, framework-agnostic RPC/API builder for TypeScript. Define procedures once, keep their input/output types attached to the handler, and let integrations reuse the same definition for query keys, TanStack Query options, SWR tuples, mutations, or generated OpenAPI clients.

It is intentionally not a transport framework. A procedure can call `fetch`, a database, a server action, a queue, a local function, or anything else you want. `@hulla/api` gives you a typesafe and scalable way accross your codebase to call everything

## Install

```bash
pnpm add @hulla/api
# works also with bun, yarn, npm, deno, etc...
```

Optional integrations:

```bash
pnpm add @hulla/api-query    # @tanstack/query
pnpm add @hulla/api-swr      # swr
pnpm add @hulla/api-openapi  # openapi/swagger -> api (gen)
```

## Basic Usage

Start with an API instance and a procedure:

```ts
import { init } from '@hulla/api'

const api = init()

const ping = api.procedure.handler(() => 'pong')

ping.call() // "pong"
```

Add schemas when you want runtime parsing and inferred TypeScript:

```ts
import { z } from 'zod'

const double = api.procedure
  .input(z.number())
  .output(z.number())
  .handler(({ input }) => input * 2)

double.call(21) // 42
double.call(null)
// TS error: expected type 'number', got 'null'
// Runtime error through zod validation
```

Group named procedures with routers:

```ts
const users = api.router('users').define(({ procedure }) => ({
  all: procedure.handler(() => [
    { id: 1, name: 'Samuel' },
    { id: 2, name: 'Jane' },
  ]),
  byId: procedure
    .input(z.number())
    .handler(({ input }) => ({
      id: input,
      name: 'Samuel',
    })),
}))

users.all.call()
users.byId.call(1)

users.all.key.root // "users/all"
users.byId.key.full(1) // ["users/byId", 1]
```

## Middleware

Middleware is declared once and selected where it applies:

```ts
type Session = { userId: string }
type AdminPermissions = { canDeleteUsers: boolean }

async function getSession(): Promise<Session> {
  return fetch('/api/session').then((res) => res.json())
}

async function getAdminPermissions(): Promise<AdminPermissions> {
  const permissions = await fetch('/api/admin-permissions').then(
    (res) => res.json() as Promise<AdminPermissions>
  )

  if (!permissions.canDeleteUsers) {
    throw new Error('Admin access required')
  }

  return permissions
}

const api = init({
  middleware: {
    session: getSession,
    admin: getAdminPermissions,
  },
})

const account = api
  .router('account')
  .use('session')
  .define(({ procedure }) => ({
    me: procedure.handler(async ({ getContext }) => {
      const { session } = await getContext()

      return { id: session.userId }
    }),

    deleteUser: procedure
      .use('admin')
      .input(z.string())
      .handler(async ({ input, getContext }) => {
        const { session, admin } = await getContext()

        return {
          deletedBy: session.userId,
          canDelete: admin.canDeleteUsers,
          id: input,
        }
      }),
  }))
```

Routers pass their middleware to every procedure. Procedure-level `.use(...)` adds to that selection, and duplicate middleware keys are deduped.

## Project Structure

In most apps, create one configured instance and export it as `api`:

```ts
// src/api.ts
import { init } from '@hulla/api'
import { query } from '@hulla/api-query'

type Session = { userId: string }

async function getSession(): Promise<Session> {
  return fetch('/api/session').then((res) => res.json())
}

export const api = init({
  middleware: {
    session: getSession,
  },
  plugins: [query()],
})
```

Then import that configured instance wherever routes live:

```ts
// src/routes/users.ts
import { z } from 'zod'
import { api } from '../api'

export const users = api
  .router('users')
  .use('session')
  .define(({ procedure }) => ({
    list: procedure.handler(async ({ getContext }) => {
      const { session } = await getContext()

      return fetch(`/api/users?viewer=${session.userId}`).then((res) =>
        res.json()
      )
    }),

    byId: procedure
      .input(z.string().uuid())
      .output(
        z.object({
          id: z.string(),
          name: z.string(),
        })
      )
      .handler(async ({ input }) => {
        const response = await fetch(`/api/users/${input}`)

        return response.json()
      }),
  }))
```

The finalized procedure is the runtime value:

```ts
const user = await users.byId.call(
  '2f2f0f0c-0f0f-4f0f-8f0f-0f0f0f0f0f0f'
)

users.byId.key.root // "users/byId"
users.byId.key.full('user_123') // ["users/byId", "user_123"]
users.byId.query.options('user_123') // TanStack Query options
```

## Public And Protected Routes

You can make common route categories explicit by exporting prepared builders:

```ts
// src/api.ts
import { init } from '@hulla/api'

type Session = { userId: string }
type AdminPermissions = { canDeleteUsers: boolean }

async function getSession(): Promise<Session> {
  return fetch('/api/session').then((res) => res.json())
}

async function getAdminPermissions(): Promise<AdminPermissions> {
  const permissions = await fetch('/api/admin-permissions').then(
    (res) => res.json() as Promise<AdminPermissions>
  )

  if (!permissions.canDeleteUsers) {
    throw new Error('Admin access required')
  }

  return permissions
}

export const api = init({
  middleware: {
    session: getSession,
    admin: getAdminPermissions,
  },
})

export const procedure = {
  public: api.procedure,
  protected: api.procedure.use('session'),
  admin: api.procedure.use('session', 'admin'),
}

export const router = {
  public: api.router,
  protected: <const Name extends string>(name: Name) =>
    api.router(name).use('session'),
  admin: <const Name extends string>(name: Name) =>
    api.router(name).use('session', 'admin'),
}
```

Route files can choose the required middleware once:

```ts
// src/routes/account.ts
import { z } from 'zod'
import { router } from '../api'

export const account = router.protected('account').define(({ procedure }) => ({
  me: procedure.handler(async ({ getContext }) => {
    const { session } = await getContext()

    return { id: session.userId }
  }),

  rename: procedure
    .input(z.string().min(1))
    .handler(async ({ input, getContext }) => {
      const { session } = await getContext()

      return { id: session.userId, name: input }
    }),
}))
```

And public routes stay visibly public:

```ts
// src/routes/health.ts
import { router } from '../api'

export const health = router.public('health').define(({ procedure }) => ({
  check: procedure.handler(() => ({ ok: true })),
}))
```

The same pattern works for standalone procedures:

```ts
// src/actions/viewer.ts
import { procedure } from '../api'

export const viewer = procedure.protected.handler(({ getContext }) =>
  getContext()
)
```

`public` and `protected` are just project-level names. Hulla only cares about the selected middleware keys, so you can use `authed`, `internal`, `admin`, `tenant`, or whatever matches your app.

## Integrations

### TanStack Query

`@hulla/api-query` adds `query.options(...)` and `mutation.options(...)` helpers designed for TanStack Query.

```ts
import { init } from '@hulla/api'
import { query } from '@hulla/api-query'
import { z } from 'zod'

const api = init({
  plugins: [query()],
})

const users = api.router('users').define(({ procedure }) => ({
  all: procedure.handler(() =>
    fetch('/api/users').then((res) => res.json())
  ),
  byId: procedure
    .input(z.number())
    .handler(({ input }) =>
      fetch(`/api/users/${input}`).then((res) => res.json())
    ),
}))

const listOptions = users.all.query.options()
const boundUserOptions = users.byId.query.options(1)
const lazyUserOptions = users.byId.query.options()
const mutationOptions = users.byId.mutation.options()

// useQuery(listOptions)
// useQuery(boundUserOptions)
// lazyUserOptions.queryFn(1)
// useMutation(mutationOptions)
```

For input procedures, calling `.options(input)` binds the input into the query key and query function. Calling `.options()` returns the root key and a function that accepts the input later.

### SWR

`@hulla/api-swr` exposes `query.options(...)` and `mutation.options(...)` helpers as SWR tuples.

```ts
import { init } from '@hulla/api'
import { swr } from '@hulla/api-swr'
import { z } from 'zod'

const api = init({
  plugins: [swr()],
})

const users = api.router('users').define(({ procedure }) => ({
  byId: procedure
    .input(z.number())
    .handler(({ input }) =>
      fetch(`/api/users/${input}`).then((res) => res.json())
    ),
}))

const [key, fetcher] = users.byId.query.options(1)
const [mutationKey, mutate] = users.byId.mutation.options()

// useSWR(key, fetcher)
// useSWRMutation(mutationKey, mutate)
```

### OpenAPI

`@hulla/api-openapi` generates Hulla client factories from OpenAPI documents.

```bash
bunx @hulla/api-openapi ./openapi.json --output ./src/api.generated.ts
```

You can derive procedure names from paths instead of `operationId`:

```bash
bunx @hulla/api-openapi ./openapi.json --output ./src/generated-api --names path
```

The generated client accepts your transport function:

```ts
import { createOpenAPIClient } from './api.generated'

const client = createOpenAPIClient((request) => {
  return fetch(request.path, {
    method: request.method,
    body: request.body === undefined ? undefined : JSON.stringify(request.body),
  }).then((res) => res.json())
})

const user = await client.users.getUsersId.call({
  params: { id: 'user_123' },
})
```

## Plugin Settings

Plugins are injected automatically by default. You can make a plugin opt-in, select it on a router or procedure, or alias exposed members.

```ts
const api = init({
  plugins: [query()],
  settings: {
    plugins: {
      query: {
        inject: 'opt-in',
        aliases: {
          procedure: {
            query: 'rq',
          },
        },
      },
    },
  },
})

const users = api
  .router('users')
  .plugin('query')
  .define(({ procedure }) => ({
    byId: procedure.input(z.number()).handler(({ input }) => input),
  }))

users.byId.rq.options(1)
```

## Output Parsing

By default, output schemas parse the resolved handler value, so async handlers work with plain schemas:

```ts
const user = api.procedure.output(z.string()).handler(async () => 'Samuel')

await user.call() // "Samuel"
```

If you want output schemas to validate the exact unawaited return value instead, set `output` to `raw`.

```ts
const api = init({
  settings: {
    output: 'raw',
  },
})
```

## Development

- Install dependencies with `bun install`
- Run checks with `bun run lint`, `bun run fmt`, `bun run test`, and `bun run build`
