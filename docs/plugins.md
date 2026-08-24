# Client integrations

Client integrations are explicit parallel views. They do not register with `defineClient()`, mutate route calls, add `$` properties, or run hooks during ordinary client construction.

## TanStack Query

```ts
import { defineClient } from '@hulla/api/client'
import { fetchTransport } from '@hulla/api/fetch'
import { createTanStackQuery } from '@hulla/api-tanstack-query'

const client = defineClient(contract, {
  transport: fetchTransport({ baseUrl: 'https://api.example.com' }),
}).create()

const query = createTanStackQuery(client)
const input = { params: { id: 'user-1' } }

query.users.queryKey() // ['users']
query.users.byId.queryKey(input) // ['users', 'byId', input]
query.users.byId.queryOptions(input)
query.users.byId.mutationOptions() // mutationFn accepts input
```

The original client remains unchanged and directly callable. The integration is paid for only by applications that import and construct it.

## SWR

```ts
import { createSWR } from '@hulla/api-swr'

const swr = createSWR(client)
const [key, fetcher] = swr.users.byId.queryOptions(input)
```

Both integrations expose router prefix keys, exact route keys, bound query helpers, and bound or unbound mutation helpers. Input-free routes use `queryOptions()` without arguments.

Server integrations should likewise wrap a completed implementation or adapter explicitly. Core intentionally has no generic lifecycle hook system.
