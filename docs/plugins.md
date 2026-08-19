# Plugins

Plugins extend client or procedure callables and can observe server definitions without changing the contract. Their capability sections declare where they can run:

- `client` for Fetch client integrations
- `server` for implementation or adapter integrations
- `procedures` for built application procedure trees

A plugin can provide any combination of these sections. Core infers its capabilities from the sections themselves and rejects registration with an incompatible definition. There is no separate target declaration to keep in sync.

```ts
import { definePlugin } from '@hulla/api/plugin'

const diagnostics = definePlugin({
  id: 'diagnostics',
  client: {
    build: ({ contract, routes }) => {},
  },
  server: {
    build: ({ contract, handlers }) => {},
  },
  procedures: {
    build: ({ procedures }) => {},
  },
})
```

Plugin ids must be unique within a definition. Client `route`/`router` and procedure `procedure`/`router` hooks return members that core installs with a framework-owned `$` prefix, so a plugin's `queryKey` member is exposed as `$queryKey`. Plugin authors must omit the prefix themselves. Duplicate members and the reserved `$meta` member are rejected. Reusable plugins bind their public type maps directly to their hook types; the tokens exported by `@hulla/api/plugin` resolve each callable's input, result, and structural key without adding type-only fields to the runtime plugin object.

## TanStack Query

```ts
import { defineClient } from '@hulla/api/client'
import { tanstackQueryPlugin } from '@hulla/api-tanstack-query'

const client = defineClient(contract, {
  baseUrl: 'https://api.example.com',
  plugins: [tanstackQueryPlugin()],
}).build()

const input = { params: { id: 'user-1' } }
const options = client.users.byId.$queryOptions({
  params: { id: 'user-1' },
})

options.queryKey // ['users', 'byId', input]
options.queryFn  // forwards TanStack's AbortSignal to Fetch

client.users.$queryKey()                    // ['users']
client.users.byId.$queryKey()               // ['users', 'byId']
client.users.byId.$queryKey(input)          // ['users', 'byId', input]
client.users.byId.$mutationOptions(input)   // bound mutation
client.users.byId.$mutationOptions()        // mutationFn accepts input
```

The query function returns the client's status-discriminated response envelope. Applications can narrow `status` and select `body` without losing declared error responses.

The same plugin can be registered with a procedure scope. Only procedures inside a built tree receive plugin members because standalone procedures have no structural key:

```ts
import { defineProcedures } from '@hulla/api/procedure'

const procedures = defineProcedures({ plugins: [tanstackQueryPlugin()] })
const api = procedures.build({ users: { byId } })

api.users.$queryKey()                    // ['users']
api.users.byId.$queryOptions(input)
api.users.byId.$mutationOptions()
```

## SWR

```ts
import { swrPlugin } from '@hulla/api-swr'

const client = defineClient(contract, {
  baseUrl: 'https://api.example.com',
  plugins: [swrPlugin()],
}).build()

const [key, fetcher] = client.users.byId.$queryOptions(input)
```

Both integrations expose the same prefix and exact key helper:

```ts
client.users.$queryKey()             // ['users']
client.users.byId.$queryKey()        // ['users', 'byId']
client.users.byId.$queryKey(input)   // ['users', 'byId', input]
```

Router nodes expose only `$queryKey()`, which makes prefix operations such as invalidating every users query discoverable without adding options to non-callable nodes. `$queryOptions()` requires the same route input as the client call. Input-free routes use `$queryOptions()` with no arguments. Mutation options additionally support an unbound form because the mutation function can receive its input when it executes.

Procedure integrations follow the same rules. Their query and mutation functions preserve the procedure's synchronous or asynchronous return type rather than forcing every procedure through a Promise boundary.
