# Authoring and lifetime migration

Clients are executable immediately:

```ts
const base = defineClient(contract, { transport })
await base.health()
const protectedClient = base.use(authenticate)
const users = protectedClient.select(contract.routes.users)
const client = base.compose(base.select(contract.routes.health), users)
```

Remove the terminal `.create()` call. Replace `.create(node)` with `.select(node)` and `.create(...fragments)` with `.compose(...fragments)`. Server binding remains `.implement(handlers)` or `.implement(node, handlers)`; replace server `.implement(...fragments)` with `.compose(...fragments)`. Composition requires all routes, and checks duplicates and compatible middleware scopes. Selected fragments are usable independently.

Each client scope is immutable. Accessing a top-level subtree compiles and caches that subtree. `select()` controls materialization, but does not automatically split a JavaScript bundle or dynamically import code. Keep separately loaded contract modules at real module boundaries when code splitting matters.

Client root names `contract`, `context`, `middlewares`, `middleware`, `use`, `select`, and `compose` are reserved. Nested route names can still use them. `create` is now available as a normal route name. Query integration views additionally reserve `queryKey` at every level.

Handlers may return a subset of declared statuses. Missing routes, undeclared statuses and invalid response bodies remain errors. Client response unions still reflect the contract, so callers continue to narrow by status.

Native context no longer implicitly preserves a Fetch request body. Set `preserveRequestBody: true` on Fetch/H3/Hono/Elysia mounts when needed. Owned request readers default to a 1 MiB byte limit. Set `maxBodyBytes` deliberately for upload endpoints. Host parsers retain their own limits. NDJSON/SSE decoders default to a 1 MiB record limit; use `createNdjsonFormat({ maxRecordBytes })` or `createSseJsonFormat({ maxRecordBytes })`, including `Infinity` for an explicitly unbounded decoder.

Response headers now support `string | readonly string[]` and normalize names to lowercase. Arrays preserve repeated cookies. Update code that assumed every response header was a scalar. Explicit header schemas still determine their decoded application types.

Custom transports can implement `dispose(reason)`. Core calls it when response decoding fails before handing the response to the application. Successful raw and stream responses transfer ownership to the caller: consume them or close/cancel them. Forward the portable request `signal` to downstream work and close iterators in `finally`.

TanStack Query and SWR accept `{ prefix: ['service', tenantId, sessionVersion] }`. Include the API and authentication scope when clients share a cache; clear sensitive cache entries on logout.


## MessagePort package

Install `@hulla/api-message-port` alongside core and change imports from the removed `@hulla/api/message-port` subpath:

```ts
import { messagePortAdapter, messagePortTransport } from '@hulla/api-message-port'
```

The same package exports `messagePortEndpoint`, protocol types, and custom IPC endpoint support. Call signatures, the default channel, protocol version, cancellation and stream flow control are unchanged. Fetch and in-process transport remain at `@hulla/api/fetch` and `@hulla/api/in-process`.
