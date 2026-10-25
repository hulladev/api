# @hulla/api 2.0 migration reference

Look up the replacement for an API from `@hulla/api` 1.x. For a worked example that migrates one route, start with [Migrate from @hulla/api 1.x](https://hulla.dev/docs/api/start/migration).

## Identify the starting API

Do not infer a migration from a function name alone. The stable 1.2.5 API and an archived 2.0 beta used different
authoring models.

| Code or package you have                                                                                               | Source generation | Migration direction                                                                                                           |
| ---------------------------------------------------------------------------------------------------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `api()`, `a.router({ name, routes })`, `a.procedure(...)`, `@hulla/api-fetch`, `@hulla/api-query`, or `@hulla/api-swr` | Stable 1.2.5      | Move procedures into an explicit contract and server implementation, then choose a current transport and integration package. |
| `createApi()`, generated client builders, `.select()`, `.create()`, or `.build()`                                      | Archived 2.0 beta | Do not translate this as the stable 1.2.5 API. Move to the current contract, server, and direct-client model.                 |
| `defineContract()`, `defineServer()`, `createClient()`, or `@hulla/api/*` transport subpaths                           | Current 2.0       | Use the current core and integration guides; this page is only for checking later 2.0 changes.                                |

Version 2.0 is a redesign, not a line-by-line rename. The contract records the boundary, the server implementation
supplies behavior, the adapter or transport crosses one host boundary, and the client constructs typed calls from the
contract or one of its selections.

## Stable 1.2.5: procedures become contracts

Stable 1.2.5 used `api()` as the authoring factory. A procedure carried its route name, method, input and output
behavior, and implementation. A router assembled those procedures and exposed method calls by route name:

```ts
import { api } from '@hulla/api'
import { z } from 'zod'

const a = api()
const health = a
  .procedure('health', 'get')
  .output(z.object({ ok: z.literal(true) }))
  .define(() => ({ ok: true }))

const routes = a.router({
  name: 'api',
  routes: [health],
})

const result = routes.get('health')
```

The current model makes the route and response status explicit, separates implementation from declaration, and lets the
client choose a transport:

```ts
import { defineContract, response, route } from '@hulla/api'
import { createClient } from '@hulla/api/client'
import { inProcessTransport } from '@hulla/api/in-process'
import { defineServer } from '@hulla/api/server'
import { z } from 'zod'

const contract = defineContract({
  routes: {
    health: route.get('/health', {
      responses: { 200: response.json(z.object({ ok: z.literal(true) })) },
    }),
  },
})

const implementation = defineServer(contract).implement({
  health: ({ response }) => response(200, { ok: true }),
})

const client = createClient(contract, {
  transport: inProcessTransport(implementation),
})

const result = await client.health()
console.log(result.body.ok) // true
```

If the old route crossed HTTP, replace the old `@hulla/api-fetch` request or instance setup with
`fetchTransport()` on the client and `fetchAdapter().mount(implementation)` on the server. The in-process example
above proves the contract lifecycle without a network hop.

Use `request.json()`, `request.text()`, `request.bytes()`, or `request.formData()` to place input explicitly in the
contract. Use `response.json()`, `response.text()`, `response.bytes()`, `response.formData()`, `response.empty()`, or
`response.stream()` for declared response representations. A handler returns a declared status through the server
response helper; it does not rely on an implicit `200`.

## Archived 2.0 beta: builders become direct selections

Some archived 2.0 beta snapshots used `createApi()` and later client-builder APIs. Those names are not the stable 1.2.5
starting point and are not the current 2.0 contract API.

| Archived beta shape                            | Current 2.0 action                                                                                                                                                        |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createApi()` route or generated builder       | Declare the route with `defineContract()` and implement it with `defineServer()`.                                                                                         |
| `defineClient()`                               | Call `createClient(contractOrSelection, { transport })`.                                                                                                                  |
| `.select(node)`                                | Pass the selected contract node as the first `createClient()` argument.                                                                                                   |
| `.use(...)`                                    | Supply `middleware: [...]` in the client options.                                                                                                                         |
| `.middleware(...)`                             | Use inline middleware or the standalone `clientMiddleware(contract, handler)` helper.                                                                                     |
| Terminal `.create()` or `.build()`             | Remove the terminal call. Client construction is `createClient(...)`.                                                                                                     |
| Client `.compose()` and ownership checks       | Group separately selected clients with ordinary application objects. Server composition remains available and still validates coverage, duplicates, and middleware scope. |
| A selected client type inferred from a builder | Use `ClientFor<typeof selection>` when a public client type needs an explicit name.                                                                                       |

Every property on a current client is an endpoint or a nested object of endpoints. Names such as `use`, `select`, and
`compose` are no longer reserved by client construction. Use real module boundaries when code splitting is needed;
selection does not split bundles by itself.

## Client and transport replacements

| Old shape                                                 | Current replacement                                     | Observable action                                                                                                                                                                                                   |
| --------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createHttpTransport(...)`                                | `fetchTransport(...)` from `@hulla/api/fetch`           | Construct the transport explicitly and pass it to `createClient()`.                                                                                                                                                 |
| `createApiHandler({ routers, basePath, contract }).fetch` | `fetchAdapter().mount(implementation)`                  | Mount a complete server implementation. The adapter returns a handler; it does not listen on a port.                                                                                                                |
| Positional route arguments                                | Structured `{ params, query, headers, body }` input     | Move each value to the contract location it belongs to. Request options such as `signal` are a separate second argument when the route has input.                                                                   |
| An implicit response status or direct handler return      | Declared response statuses and `response(status, body)` | Add each status to the route declaration and narrow the client result by `status`.                                                                                                                                  |
| `HullaAPIError` catch for an expected non-2xx result      | Declared response status                                | Narrow declared statuses in the resolved result, or use `errorMode: 'throw'` for named `defineErrors()`. Continue handling rejected promises for transport, unexpected-status, representation, and schema failures. |
| A local stable router call or beta generated client call  | `inProcessTransport(implementation)`                    | Construct a client around the implementation when both sides share a process. The transport does not match a URL or construct Fetch objects.                                                                        |

The application still owns network hosting, authentication, retries, caching, deduplication, loading state, and query
library behavior. The adapter or transport only crosses its declared boundary.

## Package and import boundaries

Stable 1.2.5 packages do not all have one-to-one replacements:

| Stable 1.2.5 package | Current 2.0 boundary                                                   | Migration action                                                                                                         |
| -------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `@hulla/api-fetch`   | `fetchTransport()` and `fetchAdapter()` from `@hulla/api/fetch`        | Rewrite the old request group as an explicit contract, implementation, and client. This is not a package rename.         |
| `@hulla/api-query`   | `@hulla/api-tanstack-query`, `@hulla/api-swr`, or a plain typed client | Choose the cache owner first; the old generic `query(router)` and `mutation(router)` helpers have no direct replacement. |
| `@hulla/api-swr`     | `createSWR(client, options)` from `@hulla/api-swr`                     | Create a current typed client first, then derive a separate SWR view from it.                                            |

Use the [installation guide](https://hulla.dev/docs/api/installation) for current package commands and peer
requirements.

### Archived beta MessagePort extraction

In current 2.0, Fetch and in-process transport are core subpaths, while MessagePort is a separate package. Replace the
archived `@hulla/api/message-port` subpath with:

```ts
import {
  messagePortAdapter,
  messagePortTransport,
} from '@hulla/api-message-port'
```

The package also exports `messagePortEndpoint`, protocol types, and custom IPC endpoint support. The current channel,
cancellation, and pull-driven stream behavior remain protocol concerns of that package. Use the
[MessagePort transport guide](https://hulla.dev/docs/api/transports/message-port) for endpoint ownership and lifecycle.

### Archived beta Node extraction

Install `@hulla/api-node` instead of `@hulla/api-node-http` and import the standalone HTTP adapter from
`@hulla/api-node/http`:

```ts
import { nodeHttpAdapter } from '@hulla/api-node/http'
```

Shared helpers previously imported from `@hulla/api/adapters/node` now come from `@hulla/api-node`. Direct TypeScript
users of `@hulla/api-node` must satisfy its `@types/node >=22` peer dependency. The Express, Fastify, Koa, and NestJS
adapter packages depend on `@hulla/api-node` and retain their own framework and Node peer requirements. Fetch remains
available from `@hulla/api/fetch`.

The host still owns the listener, upgrade policy, authentication, timeouts, connection limits, and shutdown. A mount
operation registers or returns a handler; it does not create a server or begin listening.

## Removed procedures and async markers

Standalone procedures and `@hulla/api/procedure` are removed. Use ordinary application functions when a call does not
need the contract lifecycle. Use a selected in-process client when local code needs contract validation, middleware,
declared responses, and cancellation.

`validation.async()`, `asyncSchema()`, and their marker types are also removed. Standard Schema validators can return
promises directly, and HTTP client calls always return promises. No replacement package or async mode is needed.

## Response and validation changes

Ordinary response schemas run on the server. They validate or transform the handler value, and the client consumes the
serialized output without rerunning the ordinary response schema. This rule also applies to response headers, formatted
stream items, and declared error data.

Use an explicit codec when both sides should receive an application value such as `Date`. A response transform that
produces a `Date` must instead encode an ISO string or use a codec. Use `request.json<T>()` and `response.json<T>()` for
typed native JSON without runtime shape validation; supply a Standard Schema when runtime validation and transformation
are required. Fetch and HTTP adapters parse JSON text and reject malformed JSON. In-process and MessagePort transports
pass structured values or protocol messages, so they do not perform an HTTP JSON-text parse.

The client-wide `responseValidation` setting is removed. The client checks the declared status and representation, while
the server owns ordinary response schema validation.

## Request lifetime, bodies, and limits

Request fields are processed in parameter, query, header, and body order and stop on failure. Server response headers
validate before the body. If client header decoding is asynchronous, body decoding runs concurrently and is cancelled
when header decoding fails.

Native context no longer implicitly preserves a Fetch request body. Set `preserveRequestBody: true` on Fetch, H3, Hono,
or Elysia mounts when context or middleware must read the original request body after adapter processing.

Owned request readers impose no byte cap by default. Set `maxBodyBytes` explicitly when the adapter should enforce a
limit; host parsers retain their own limits. NDJSON and SSE JSON decoders default to a 1 MiB record limit. Use
`createNdjsonFormat({ maxRecordBytes })` or `createSseJsonFormat({ maxRecordBytes })`, including `Infinity` when an
explicitly unbounded decoder is required.

## Response headers and ownership

Response header values are now `string | readonly string[]`, and names normalize to lowercase. Arrays preserve repeated
headers such as cookies. Update code that assumed every response header was a scalar. Explicit header schemas still
determine the decoded application type.

Custom transports can implement `dispose(reason)`. Core calls it when response decoding fails before handing the
response to application code. Successful raw and streaming responses transfer ownership to the caller: consume them or
close/cancel them. Forward the portable request `signal` to downstream work and close owned iterators in `finally`.

## Query integrations

Stable `@hulla/api-query` exposed generic `query(router)` and `mutation(router)` helpers. There is no one-to-one current
generic package: choose TanStack Query, SWR, or a plain typed client according to who should own cache and request state.

Archived beta plugins and generated `$tanstack` / `$swr` namespaces are replaced by parallel client views:

```ts
import { createTanStackQuery } from '@hulla/api-tanstack-query'
import { createSWR } from '@hulla/api-swr'

const queries = createTanStackQuery(client, {
  prefix: ['service', tenantId, sessionVersion],
})
const swr = createSWR(client, {
  prefix: ['service', tenantId, sessionVersion],
})
```

Pass the returned query or mutation options to the chosen library. Include the API and authentication scope when
clients share a cache, and clear sensitive cache entries on logout. A contract node named `queryKey` remains reserved
by these integrations. See the [query-library chooser](./plugins.md) before selecting a package.

## Migration completion checklist

- Identify whether the code started from stable 1.2.5 `api()` or an archived 2.0 beta `createApi()`/builder API.
- Move one route into a shared `defineContract()` declaration with explicit input locations and declared statuses.
- Implement the selected contract with `defineServer().implement(...)` and mount it through the chosen host adapter.
- Construct the client with `createClient(contractOrSelection, { transport })`.
- Replace old package imports and query integrations.
- Audit schemas, codecs, headers, body preservation, limits, response ownership, and cancellation.
- Verify one real client call and narrow its declared response by `status`.

After the first route works, continue with [contract authoring](https://hulla.dev/docs/api/core/contracts),
[server implementations](https://hulla.dev/docs/api/core/servers), [typed clients](https://hulla.dev/docs/api/core/clients),
and the [request and value boundary guides](https://hulla.dev/docs/api/core/request-transport).
