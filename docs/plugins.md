# Plugins

Plugins extend a client or observe a server definition without changing the contract. Every plugin declares where it can run:

- `target: 'client'` for browser/client integrations
- `target: 'server'` for implementation or adapter integrations
- `target: 'universal'` when the same package supplies hooks for both definitions

Core validates that declaration when `defineClient()` or `defineServer()` is called. This is an API compatibility check, not environment or installed-package detection; plugins do not need to guess whether a browser or server happens to be evaluating the module.

```ts
import { definePlugin } from '@hulla/api/plugin'

const diagnostics = definePlugin({
  id: 'diagnostics',
  target: 'universal',
  client: {
    build: ({ contract, routes }) => {},
  },
  server: {
    build: ({ contract, handlers }) => {},
  },
})
```

Plugin ids and namespaces must be unique within a definition. A client route hook returns members that core installs under the plugin's `$`-prefixed namespace. `routeTypes` is its type-only counterpart; reusable plugins can use the route tokens exported by `@hulla/api/plugin` to resolve each route's input, result, and structural key.

## TanStack Query

```ts
import { defineClient } from '@hulla/api/client'
import { tanstackQueryPlugin } from '@hulla/api-tanstack-query'

const client = defineClient(contract, {
  baseUrl: 'https://api.example.com',
  plugins: [tanstackQueryPlugin()],
}).build()

const options = client.users.byId.$tanstack.queryOptions({
  params: { id: 'user-1' },
})

options.queryKey // ['users/byId', input]
options.queryFn  // forwards TanStack's AbortSignal to Fetch

client.users.byId.$tanstack.mutationOptions(input) // bound mutation
client.users.byId.$tanstack.mutationOptions()      // mutationFn accepts input
```

The query function returns the client's status-discriminated response envelope. Applications can narrow `status` and select `body` without losing declared error responses.

## SWR

```ts
import { swrPlugin } from '@hulla/api-swr'

const client = defineClient(contract, {
  baseUrl: 'https://api.example.com',
  plugins: [swrPlugin()],
}).build()

const [key, fetcher] = client.users.byId.$swr.queryOptions(input)
const [rootKey, fetchWithInput] = client.users.byId.$swr.queryOptions()
```

Both integrations request the shared `$key` helper:

```ts
client.users.byId.$key.root        // 'users/byId'
client.users.byId.$key.full(input) // ['users/byId', input]
```

Pass `{ namespace: 'query' }` to either plugin factory to replace its default `$tanstack` or `$swr` namespace with `$query`.
