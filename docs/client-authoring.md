# Client authoring

`createClient(contractOrSelection, options)` returns a plain tree of endpoint functions, or a single function when given a route. Start with the shared contract from [contract authoring](./contract-authoring.md). Construction prepares the selected routes once; every call returns a promise. Middleware is supplied in the options.

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

A context factory runs once per call with the encoded request and route metadata. Middleware runs in array order and wraps transport execution and response decoding:

```ts
export const client = createClient(contract, {
  transport: fetchTransport({ baseUrl: 'https://api.example.com' }),
  context: ({ request }) => ({ accessToken: session.accessToken, path: request.path }),
  middleware: [async ({ context, next, request }) => {
    request.headers.authorization = `Bearer ${context.accessToken}`
    return next()
  }],
})
```

Context can contain memoized functions when a value is expensive and only some middleware needs it. Request headers are mutable. Route identity, method, and path are fixed before middleware; URL rewriting belongs in the transport. Middleware may reject a call or return a typed contract-level error through `errors` or `response`. Calling `next()` twice is an error.

Use the standalone `clientMiddleware(contract, handler)` typing helper for reusable middleware. It exposes portable route metadata and the selected contract's declared errors. Inline middleware also infers the context from construction options.

## Selecting clients for separate modules

Pass the required contract node directly to construction:

```ts
export const health = createClient(contract.routes.health, {
  transport,
  middleware: [logRequests],
})
export const organizations = createClient(contract.routes.organizations, {
  transport,
  middleware: [logRequests, authenticate],
})

// Optional application namespace.
export const client = { health, organizations }
```

Selections retain inherited paths, parameter schemas, and declared errors through public `$contract` metadata. Each constructor owns its context factory and a snapshot of its middleware array. Construction never modifies another client.

Clients can cover any subset of endpoints. There is no client builder or recomposition operation. Endpoint names such as `use`, `select`, and `compose` are ordinary names. A selected route is a function; a selected router is a tree of functions. Server composition remains exhaustive because an implementation must supply its selected handlers. Selection does not automatically split JavaScript bundles; use real module boundaries for code splitting.

For framework-specific client placement, server-only import guards, and native server-function patterns, see [hybrid rendering](./hybrid-rendering.md).

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

const client = createClient(contract, {
  transport: inProcessAdapter().mount(implementation),
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

Validation follows the contract declaration, with no client-wide mode. `response.json<User>()` uses native JSON parsing and supplies compile-time types; it does not check the shape at runtime. `response.json(userSchema)` validates and applies the schema's declared transforms on the server, then sends the resulting output. `response.json(userCodec)` additionally encodes application values on the server and decodes them on the client. The client does not rerun ordinary response schemas. It trusts the server contract, while still checking status, content type, and transport parsing. Codec responses explicitly validate and decode on the client.

Static `headers` objects are captured and normalized when the client is constructed. Supply `headers: () => currentHeaders` when values must change per call.

For very large contracts exported from a library that emits `.d.ts` files, give the client an explicit public type:

```ts
import { createClient, type ClientFor } from '@hulla/api/client'

export const client: ClientFor<typeof contract> = createClient(contract, { transport })
```

This preserves endpoint types while allowing TypeScript to name the contract instead of expanding the complete inferred client. The 1,000-route diagnostic reaches TypeScript's inferred declaration serialization limit (`TS7056`) without this annotation; ordinary type checking still succeeds. Selected clients remain useful for keeping application modules focused.
