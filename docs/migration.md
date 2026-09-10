# Migration to contract selections

Construct clients directly from a root contract, router, or route:

```ts
const client = createClient(contract, { transport })
const users = createClient(contract.routes.users, { transport, middleware: [authenticate] })
const health = createClient(contract.routes.health, { transport })
await users.byId({ params: { id: 'user-1' } })
await health()
```

Replace `defineClient()` with `createClient()`. Move client `.use()` registrations into the `middleware` array and pass the node previously supplied to `.select()` as the first constructor argument. Remove terminal `.create()` or `.build()` calls. Replace client `.middleware()` with inline middleware or the standalone `clientMiddleware(contract, handler)` helper. Client composition and ownership checks are gone; group selected calls with ordinary objects. Use `ClientFor<typeof selection>` for a selected client type.

All client properties are endpoints. Former control names such as `use`, `select`, and `compose` are available. Query integration views still reserve `queryKey`. The selected tree is prepared at construction; use module boundaries for code splitting.

Contracts expose an immutable `$contract` selection manifest containing keys, compiled routes, and errors. Mounted nodes are contextual copies of declarations, so compare structural keys rather than raw declaration identity. The same declaration can be mounted at different paths. Server implementations expose their handler `bindings`; adapters consume that public boundary.

Server binding remains `.implement(handlers)` or `.implement(node, handlers)`. Server `.compose(...fragments)` checks coverage, duplicates, and middleware scope compatibility.

HTTP calls return promises, but synchronous validation, encoding, and handlers do not incur an await at each step. One executor handles each selected server route. In-process transport dispatches by contract key and encoded parameters instead of matching the URL. Client middleware cannot retarget an invocation; customize URLs in the transport.

Ordinary response schemas now run only on the server and send their output, including transforms and stripped fields. The client consumes that wire output without repeating validation. Response headers, formatted stream items, and declared error data follow the same rule. A response transform producing a Date must become an explicit codec or produce an ISO string. Request schemas still run on the server after parsing. Explicit codecs support bidirectional conversion. The client `responseValidation` setting has been removed. Use `request.json<T>()` and `response.json<T>()` for typed native JSON without runtime shape validation; supply a schema to explicitly validate and transform. Native JSON parsing still rejects malformed JSON. Static client headers are captured at construction; use a function for changing headers.

Request fields process in parameter, query, header, and body order and stop on failure. Server response headers validate before the body. When client header decoding is asynchronous, body decoding runs concurrently with cancellation on failure. Error phases, cancellation, and stream ownership remain part of the lifecycle.

Handlers may return a subset of declared statuses. Missing routes, undeclared statuses and invalid response bodies remain errors. Client response unions still reflect the contract, so callers continue to narrow by status.

Native context no longer implicitly preserves a Fetch request body. Set `preserveRequestBody: true` on Fetch/H3/Hono/Elysia mounts when needed. Owned request readers impose no byte cap by default. Set `maxBodyBytes` explicitly to opt into a limit. Host parsers retain their own limits. NDJSON/SSE decoders default to a 1 MiB record limit; use `createNdjsonFormat({ maxRecordBytes })` or `createSseJsonFormat({ maxRecordBytes })`, including `Infinity` for an explicitly unbounded decoder.

Response headers now support `string | readonly string[]` and normalize names to lowercase. Arrays preserve repeated cookies. Update code that assumed every response header was a scalar. Explicit header schemas still determine their decoded application types.

Custom transports can implement `dispose(reason)`. Core calls it when response decoding fails before handing the response to the application. Successful raw and stream responses transfer ownership to the caller: consume them or close/cancel them. Forward the portable request `signal` to downstream work and close iterators in `finally`.

TanStack Query and SWR accept `{ prefix: ['service', tenantId, sessionVersion] }`. Include the API and authentication scope when clients share a cache; clear sensitive cache entries on logout.


## MessagePort package

Install `@hulla/api-message-port` alongside core and change imports from the removed `@hulla/api/message-port` subpath:

```ts
import { messagePortAdapter, messagePortTransport } from '@hulla/api-message-port'
```

The same package exports `messagePortEndpoint`, protocol types, and custom IPC endpoint support. Call signatures, the default channel, protocol version, cancellation and stream flow control are unchanged. Fetch and in-process transport remain at `@hulla/api/fetch` and `@hulla/api/in-process`.

## Node package boundary

Install `@hulla/api-node` in place of `@hulla/api-node-http` and import the standalone
`nodeHttpAdapter` from `@hulla/api-node/http`. Shared helpers previously exported by
`@hulla/api/adapters/node` now come from `@hulla/api-node`. Express, Fastify, Koa, and
NestJS install the shared Node package automatically. Fetch remains available at
`@hulla/api/fetch`.

Standalone procedures and `@hulla/api/procedure` have been removed. Use ordinary application functions, or a selected in-process client when the contract lifecycle is required. `validation.async()` / `asyncSchema()` and their marker types have also been removed: Standard Schema validators can return promises directly, and HTTP client calls always return promises. No replacement package or async mode is needed.
