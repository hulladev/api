# Client integrations

Client integrations are explicit parallel views over the client described in
[client authoring](./client-authoring.md). They do not register with `createClient()`, mutate route calls, add `$`
properties, or run hooks during ordinary client construction. These examples use the shared contract from
[contract authoring](./contract-authoring.md).

## TanStack Query

```ts
import { createClient } from '@hulla/api/client'
import { fetchTransport } from '@hulla/api/fetch'
import { createTanStackQuery } from '@hulla/api-tanstack-query'
import { contract } from './contract'

const client = createClient(contract, {
  transport: fetchTransport({ baseUrl: 'https://api.example.com' }),
})

const query = createTanStackQuery(client)
const input = { params: { id: 'user-1' } }

query.users.queryKey() // ['users']
query.users.byId.queryKey(input) // ['users', 'byId', input]
query.users.byId.queryOptions(input)
query.users.byId.mutationOptions() // mutationFn accepts input
```

Pass those objects directly to the adapter for the UI framework. For example, React consumers use them without another
wrapper:

```tsx
import { useMutation, useQuery } from '@tanstack/react-query'

const user = useQuery(query.users.byId.queryOptions(input))
const renameUser = useMutation(query.users.rename.mutationOptions())

if (user.data?.status === 200) {
  user.data.body
}

renameUser.mutate({ params: { id: 'user-1' }, body: { name: 'Ada' } })
```

The original client remains unchanged and directly callable. The integration is paid for only by applications that
import and construct it.

## SWR

```ts
import { createSWR } from '@hulla/api-swr'

const swr = createSWR(client)
const [key, fetcher] = swr.users.byId.queryOptions(input)
```

Pass the tuple directly to `useSWR` and narrow the declared response status before reading its body:

```tsx
import useSWR from 'swr'

const user = useSWR(...swr.users.byId.queryOptions(input))

if (user.data?.status === 200) {
  user.data.body
}
```

Both integrations expose router prefix keys, exact route keys, bound query helpers, and bound or unbound mutation helpers. Input-free routes use `queryOptions()` without arguments.

Server integrations should likewise wrap a completed implementation or adapter explicitly. Core intentionally has no generic lifecycle hook system.

## Cache namespaces and error policy

Pass `{ prefix: ['api-name', tenantId, sessionVersion] }` as the second argument to `createTanStackQuery` or `createSWR` when clients share a cache. The default remains an empty prefix. Recreate the integration when tenant/auth scope changes, and clear sensitive cached data on logout. Prefixes identify a scope; do not put credentials in keys.

TanStack Query uses router keys for prefix invalidation and forwards its query signal. SWR uses structurally serialized route/input keys. The name `queryKey` is reserved at every level of these integration views. Authoring controls such as `use` and `select` are excluded from their types and runtime keys.

Declared error responses are data by default. A query library therefore considers them a successful fetch unless application code throws or the client uses the declared-error `errorMode: 'throw'` policy. Choose this policy deliberately; a transport/schema failure already rejects.
