# Client authoring

`createClient()` turns a [contract](./contract-authoring.md) into functions you can call. Pass the route's input, await the response, and check its status before using the body.

## Create a client and make a call

```ts
import { createClient } from '@hulla/api/client'
import { fetchTransport } from '@hulla/api/fetch'
import { contract } from './contract'

const client = createClient(contract, {
  transport: fetchTransport({ baseUrl: 'https://api.example.com' }),
})

const result = await client.users.rename({
  params: { id: 'user-1' },
  body: { name: 'Ada' },
})

if (result.status === 200) {
  result.body
  result.headers
}
```

In a browser, you can omit `baseUrl` to call the current origin. In Node.js and other server runtimes, use an absolute URL unless your framework provides a request-aware Fetch. See [Server and browser calls](./hybrid-rendering.md) for the two setups.

## Pass input and request options

Routes without declared request data take only optional request-scoped transport options:

```ts
const controller = new AbortController()

await client.health()
await client.health({ signal: controller.signal })
```

Routes with declared request data take those options as a second argument:

```ts
const controller = new AbortController()
const input = {
  params: { id: 'user-1' },
  body: { name: 'Ada' },
}

await client.users.rename(input, { signal: controller.signal })
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

A context factory runs once per call with the encoded request and route metadata. Middleware runs in array order and wraps transport execution and response decoding:

```ts
const session = { accessToken: 'example-token' }

export const client = createClient(contract, {
  transport: fetchTransport({ baseUrl: 'https://api.example.com' }),
  context: ({ request }) => ({
    accessToken: session.accessToken,
    path: request.path,
  }),
  middleware: [
    async ({ context, next, request }) => {
      request.headers.authorization = `Bearer ${context.accessToken}`
      return next()
    },
  ],
})
```

Context can hold memoized functions for expensive values that only some middleware needs.

Request headers are mutable. Route identity, method, and path are fixed before middleware; rewrite URLs in the transport. Middleware can reject a call or return a typed contract-level error through `errors` or `response`.

> [!WARNING] Call next only once
> Calling `next()` twice is an error. Return its result so the caller receives the transport response.

Use the standalone `clientMiddleware(contract, handler)` typing helper for reusable middleware. It exposes portable route metadata and the selected contract's declared errors. Inline middleware also infers the context from construction options.

## Selecting clients for separate modules

Pass the required contract node directly to construction:

```ts
import { clientMiddleware, createClient } from '@hulla/api/client'
import { inProcessTransport } from '@hulla/api/in-process'
import { contract } from './contract'
import { implementation } from './server'

const transport = inProcessTransport(implementation)
const logRequests = clientMiddleware(contract, ({ next, route }) => {
  console.info(route.key.join('.'))
  return next()
})
const authenticate = clientMiddleware(contract, ({ next, request }) => {
  request.headers.authorization = 'Bearer example-token'
  return next()
})

export const health = createClient(contract.routes.health, {
  transport,
  middleware: [logRequests],
})
export const users = createClient(contract.routes.users, {
  transport,
  middleware: [logRequests, authenticate],
})

// Optional application namespace.
export const client = { health, users }
```

Selections retain inherited paths, parameter schemas, and declared errors through public `$contract` metadata. Each constructor owns its context factory and a snapshot of its middleware array. Construction never modifies another client.

A selected route produces one callable function; a selected router produces a tree of functions. Clients can cover any subset of endpoints, while a server must implement every route in its selection.

Selection does not split JavaScript bundles. Use separate modules for code splitting. Names such as `use`, `select`, and `compose` remain ordinary endpoint names; the client has no builder or recomposition operation.

For framework-specific client placement, server-only import guards, and native server-function patterns, see
[server and browser calls](./hybrid-rendering.md).

## Transport boundary

Each client leaf performs exactly one transport invocation. Ordinary schemas expose their input types directly; explicit codecs encode shared application values before the declared representation is handed to the transport. The selected response declaration is then decoded back into its application value.

The client does not throw merely because a transport response has a 4xx or 5xx status. Route responses and contract-level middleware errors are returned as a status-discriminated union. Transport failures, schema failures, content-type mismatches, and statuses absent from both response maps reject the call.

The core does not add retries, caching, deduplication, domain exceptions, loading state, or query-library behavior. Those policies can be ordinary application functions:

```ts
export async function renameUser(
  input: Parameters<typeof client.users.rename>[0],
) {
  const result = await client.users.rename(input)

  if (result.status !== 200) {
    throw new Error(`Could not rename user: ${result.status}`)
  }

  return result.body
}
```

When the client and server share one JavaScript process, use the same client API with the in-process transport:

```ts
import { createClient } from '@hulla/api/client'
import { inProcessTransport } from '@hulla/api/in-process'
import { contract } from './contract'
import { implementation } from './server'

const client = createClient(contract, {
  transport: inProcessTransport(implementation),
})
```

This still runs contract encoding, server validation, middleware, and response decoding, but dispatches by contract key directly and skips HTTP route matching and native Fetch object construction. It is suitable for colocated SSR, tests, and same-process application boundaries—not for communication between separate processes.

Use `inProcessAdapter().context()` for the server definition only when its context factory needs the encoded
`ClientTransportRequest`. Otherwise keep the server portable so the same implementation can be mounted through another
adapter.

For Web Workers, Node worker threads, Electron ports, or a custom ordered desktop IPC bridge, use the multiplexed
[`@hulla/api-message-port` transport](./message-port.md). It preserves the same client call surface across a process or
worker boundary and adds request cancellation and pull-driven response streaming.

Use ordinary functions for application logic. Use a selected in-process client when local calls need contract validation and middleware. Client creation does not add custom route implementations or change the generated call surface.

## Response validation

The response declaration determines validation; there is no client-wide validation mode:

| Declaration | Server | Client |
| --- | --- | --- |
| `response.json<User>()` | Serializes native JSON; no shape check. | Parses JSON; trusts the declared type. |
| `response.json(userSchema)` | Validates and applies schema transforms. | Receives the server's parsed output. |
| `response.json(userCodec)` | Validates and encodes application values. | Validates and decodes them. |

All forms check the declared status, content type, and transport parsing. Ordinary response schemas do not run again on the client. Use a [codec](./value-round-trips.md) when the client must decode a richer application value.

Static `headers` objects are captured and normalized when the client is constructed. Supply a function that returns the current headers when values must change per call.

For very large contracts exported from a library that emits `.d.ts` files, give the client an explicit public type:

```ts
import { createClient, type ClientFor } from '@hulla/api/client'
import { inProcessTransport } from '@hulla/api/in-process'
import { contract } from './contract'
import { implementation } from './server'

const transport = inProcessTransport(implementation)

export const client: ClientFor<typeof contract> = createClient(contract, {
  transport,
})
```

This preserves endpoint types while allowing TypeScript to name the contract instead of expanding the complete inferred client. The 1,000-route diagnostic reaches TypeScript's inferred declaration serialization limit (`TS7056`) without this annotation; ordinary type checking still succeeds. Selected clients remain useful for keeping application modules focused.
