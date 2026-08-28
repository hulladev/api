# Client authoring

`defineClient()` creates a transport-neutral client authoring scope. Start with the shared contract from
[contract authoring](./contract-authoring.md); the same module can be imported by server and client code. `create()`
materializes the complete contract-shaped client, while `create(node)` selects one route or recursive router fragment.
There is no extra `routes`, `api`, or procedure namespace. An executable client receives one transport in its options:

```ts
import { defineClient } from '@hulla/api/client'
import { fetchTransport } from '@hulla/api/fetch'
import { contract } from './contract'

const client = defineClient(contract, {
  transport: fetchTransport({ baseUrl: 'https://api.example.com' }),
}).create()

const result = await client.users.rename({
  params: { id: 'user-1' },
  body: { name: 'Ada' },
})

if (result.status === 200) {
  result.body
  result.headers
}
```

An omitted or path-relative `baseUrl` uses the host document's URL when the runtime can resolve relative `Request`
objects. Configure an absolute `baseUrl` in Node.js and SSR runtimes; the transport reports this requirement explicitly
when the native `Request` constructor cannot resolve the URL.

Routes without declared request data take only optional request-scoped transport options:

```ts
await client.health()
await client.health({ signal })
```

Routes with declared request data take those options as a second argument:

```ts
await client.users.rename(input, { signal })
```

## Consuming responses in an application

Every route call returns a promise for the declared status-discriminated response union. Put that promise inside the
consumer's native loader, resource, or query API and narrow `status` before reading the corresponding body and headers:

```ts
export async function getUser(id: string) {
  const result = await client.users.byId({ params: { id } })

  if (result.status === 200) return result.body
  if (result.status === 404) return undefined
  throw new Error(`Could not load user: ${result.status}`)
}
```

The client deliberately returns declared 4xx and 5xx responses instead of turning them into transport exceptions. This
lets a UI distinguish an expected `404` from a rejected network request or invalid response. Abort a stale UI request
by passing its `AbortSignal` through the request-scoped options.

Use the framework's own data layer around this function: a route loader in TanStack Router, `query()` and
`createAsync()` in Solid Router, a Server or Client Component data library in Next.js, or the application's existing
state layer. The optional [TanStack Query and SWR integrations](./plugins.md) provide keys and executable options without
changing the underlying client.

## Context and middleware

Client context follows the server context model. A context factory runs once per request with the schema-encoded neutral invocation and exact route metadata:

```ts
const base = defineClient(contract, {
  transport: fetchTransport({ baseUrl: 'https://api.example.com' }),
  context: ({ request, route }) => ({
    accessToken: session.accessToken,
    requestPath: request.path,
    routeKey: route.key,
  }),
})
```

The returned object may contain lazy memoized functions when only some middleware paths need expensive data. This keeps request lifetime and caching explicit without eagerly fetching every possible context value.

Middleware receives one options object, matching server and procedure middleware. `middleware()` defines a reusable middleware value, `use()` returns a derived scope, and `create()` captures that scope on every generated route:

```ts
const authenticate = base.middleware(async ({ context, next, request }) => {
  request.headers.authorization = `Bearer ${context.accessToken}`
  return next()
})

export const client = base.use(authenticate).create()
```

Pass a mounted contract router or route as the first argument to scope one middleware without changing the generated client shape:

```ts
export const client = base
  .use(logRequests)
  .use(contract.routes.organizations, authenticate)
  .create()
```

`use(middleware)` applies globally, `use(router, middleware)` applies below that router, and `use(route, middleware)` applies only to that route. Registrations run in declaration order. Separately registering the same middleware in overlapping scopes runs it once per matching registration; there is no function-identity deduplication.

Middleware wraps the complete transport operation, including response decoding. It can prepare the neutral invocation, perform logging or tracing before and after `next()`, and reject a call. Transport-native customization belongs in the transport configuration; for Fetch this includes injecting a compatible `fetch` function.

Client middleware can also stop every route with a contract-level error through its typed `response(status, body, headers?)` helper. Responses without declared header schemas receive an empty header record by default.

## Client fragments

Fragments remain useful when a route or router client must be exported or deployed independently. They are directly callable and retain their authoring scope when composed:

```ts
const observed = base.use(logRequests)

const health = observed.create(contract.routes.health)
const organizations = observed.use(authenticate).create(contract.routes.organizations)

export const client = observed.create(health, organizations)
```

Here both fragments use `logRequests`, while only the organization routes use `authenticate`. `create(...fragments)` requires complete route coverage and rejects duplicates, fragments from another client definition, and fragments that do not inherit the composition scope middleware. A route fragment is its route call, and a router fragment is its callable subtree, so either can also be used independently.

## Transport boundary

Each client leaf performs exactly one transport invocation. Ordinary schemas expose their input types directly; explicit codecs encode shared application values before the declared representation is handed to the transport. The selected response declaration is then decoded back into its application value.

The client does not throw merely because a transport response has a 4xx or 5xx status. Route responses and contract-level middleware errors are returned as a status-discriminated union. Transport failures, schema failures, content-type mismatches, and statuses absent from both response maps reject the call.

The core does not add retries, caching, deduplication, domain exceptions, loading state, or query-library behavior. Those policies can be ordinary application functions:

```ts
export async function createUser(input: Parameters<typeof client.organizations.createUser>[0]) {
  const result = await client.organizations.createUser(input)

  if (result.status !== 201) {
    throw new Error(`Could not create user: ${result.status}`)
  }

  return result.body
}
```

When the client and server share one JavaScript process, use the same client API with the in-process transport:

```ts
import { inProcessAdapter } from '@hulla/api/in-process'

const client = defineClient(contract, {
  transport: inProcessAdapter().mount(implementation),
}).create()
```

This still runs contract encoding, server validation, middleware, and response decoding, but skips native Fetch object construction. It is suitable for colocated SSR, tests, and same-process application boundaries—not for communication between separate processes.

Use `inProcessAdapter().context()` for the server definition only when its context factory needs the encoded
`ClientTransportRequest`. Otherwise keep the server portable so the same implementation can be mounted through another
adapter.

For Web Workers, Node worker threads, Electron ports, or a custom ordered desktop IPC bridge, use the multiplexed
[`@hulla/api/message-port` transport](./message-port.md). It preserves the same client call surface across a process or
worker boundary and adds request cancellation and pull-driven response streaming.

Use an `@hulla/api/procedure` procedure only when its validation, context, or middleware provides concrete value. Otherwise use an ordinary function. Client creation does not add custom route implementations or change the generated call surface.
