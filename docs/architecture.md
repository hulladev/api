# Core architecture

The core defines typed HTTP contracts and executes them through small transport and adapter boundaries. A contract
contains methods, paths, schemas, response statuses, and declared errors. Fetch, native framework adapters, in-process
calls, MessagePort, and WebSocket transports use that same contract.

## Value direction

```text
Client request → transport parsing → request schema → handler
Client response ← transport serialization ← response schema ← handler return
```

Both ordinary schemas run on the server: input to output, never automatically reversed. A codec explicitly adds encode at the sender and decode at the receiver. See [numeric and date round trips](./value-round-trips.md).

## From a declaration to a call

`defineContract()` resolves nested paths and parameter declarations once. `compileContract()` exposes the public,
immutable route manifest in declaration order. Each entry contains its structural key, method, complete path,
inherited parameter schemas, and original route declaration. Each mounted node exposes `$contract` metadata with its key, selected entries, and errors. Selection requires no private node registry.

Client creation and adapter mounting prepare their functions directly from this manifest. There is no intermediate
client/server contract plan or generic directional compiler. Schema validation functions are cached by schema and
boundary location; response schema preparation is shared by client and server. These caches contain configuration,
never requests, context, or application results.

A client call follows one lifecycle:

```text
encode parameters, query, headers, and body
  -> create per-call context
  -> client middleware
  -> transport
  -> decode declared response headers and body
  -> typed result
```

A server call follows one lifecycle:

```text
host routing or core route matching
  -> decode parameters, query, headers, and body
  -> create per-call context
  -> server middleware and handler
  -> validate/encode declared response
  -> host response writer
```

Request fields process in the listed order and stop on failure. When response header decoding is asynchronous, body decoding runs concurrently;
if either fails, the client disposes the response so a pending body read can be cancelled. Server error handling tracks
routing, request, context, handler, and response phases. A declared error returned or thrown by a handler or middleware
is encoded using its contract declaration. Stream consumption remains lazy and owns its cancellation and cleanup.

HTTP calls always return promises. The lifecycle awaits only steps that return promises. Synchronous schemas and handlers stay synchronous within that lifecycle, with no separate simple-route executor.

## Validation and representations

Typed JSON declarations without schemas use native serialization and parsing without a recursive shape check. Supplying a schema explicitly requests validation. There is no client-wide validation policy. Ordinary request schemas validate and transform on the server after transport parsing. Ordinary response schemas validate and transform handler values on the server before serialization; the client consumes the parsed wire output without rerunning the schema. The same response rule applies to declared headers, formatted stream items, and declared error data. Explicit `codec(wireSchema, applicationSchema, { decode, encode })` declarations make both applications use the
application representation while transports carry the wire representation. No schema-library introspection is needed.

The neutral invocation still uses HTTP vocabulary: method, path, query, headers, status, and body representation.
It does not require native Fetch objects. Native adapters can execute an already-matched route directly, while Fetch
and other catch-all hosts use the shared route trie. Static routes take precedence over parameter routes. There are
no special single-route or static-only dispatch implementations. In-process transport selects the same executor directly by contract key and passes encoded parameters without parsing a URL.

## Selection and implementation

`createClient(contractOrSelection, { transport, middleware, context })` prepares a plain tree of calls. Middleware configuration is captured once. Applications export selected clients independently or group them with ordinary objects. No builder methods occupy the endpoint namespace, and no client ownership or recomposition machinery is needed.

Server implementations remain exhaustive for their selected contract node. Server-only composition combines smaller
implementations, exposes public handler bindings, checks coverage and duplicates, and preserves middleware scopes. Native context factories declare
their adapter requirement, so incompatible mounts fail during setup.

## Import boundaries

Core depends only on the Standard Schema specification. Validators belong to applications. Frameworks and host
runtimes belong to integration packages. Fetch is included as an isolated `@hulla/api/fetch` subpath; MessagePort and
WebSocket are separate packages. Non-Fetch consumers must not retain Fetch implementations, and browser consumers
must not retain Node helpers. See `bun run check:exports` for executable source and published-package boundary checks.

Installing a package downloads its files; bundling retains reachable code. Measure those separately. Avoid adding a
new shared abstraction solely to reduce repeated imports or make client/server internals look symmetrical.

## Declaration shape

Public route and router declarations expose capabilities rather than placeholder fields. A request field such as `params`, `query`, `headers`, or `body` exists only when it is declared; absent fields are omitted instead of being present with an `undefined` value. Concrete inferred types mirror that runtime shape so completion, reflection, and narrowing advertise only usable capabilities. Broad library-facing route and router types retain optional knowledge of those fields for generic traversal.

Router children are direct properties, matching the contract, built client, and server implementation trees. Routers may recursively contain routes or more routers; compilation flattens them depth-first while accumulating every ancestor path and parameter schema. Router structure needed by generic tooling is available through the non-enumerable `$meta` property. Route declarations retain HTTP vocabulary such as `responses`; type and schema helpers provide concise reuse without inventing a second contract shape.

## Dependency rule

The package depends only on the Standard Schema specification. Schema libraries such as Zod and Valibot are neither dependencies nor peers of `@hulla/api`; applications install and import whichever implementation they use. `@hulla/api/fetch` is an isolated core subpath; `@hulla/api-message-port` is an optional package with a peer dependency on core. Core has no dependency back on MessagePort or Node helpers. The separate `@hulla/api-node` package owns Node request headers, buffered body reading, connection lifetime, and response writing with backpressure. Its `/http` entrypoint provides the standalone Node HTTP adapter. Express, Fastify, Koa, and NestJS install the shared helpers as a dependency; Fetch remains an isolated core subpath. Consumers retain only the boundary they select. `@hulla/api/adapters` exposes route-level execution and catch-all dispatch for framework-specific integrations. Adapter packages with one runtime surface export it from the package root. Packages with distinct runtime surfaces use explicit subpaths so consumers do not retain another host's adapter. The dependency-free Node HTTP adapter owns one catch-all `RequestListener` and writes directly to the native response with streaming backpressure. Native routers such as Express, Fastify, Hono, H3, and Elysia register the compiled route records directly, avoiding a second `@hulla/api` route match after the host router selects an endpoint. Serverless hosts retain their own native invocation state: AWS and Azure use direct platform event/result adapters, Netlify delegates its Web-native `Request` and `Response` to the Fetch executor, and Google Cloud Run functions bridge the Express-compatible Functions Framework boundary while streaming the resulting Web response. Full-stack file routers such as Next.js, TanStack Start, React Router v7, SolidStart, SvelteKit, Nuxt/Nitro, Astro, and Cloudflare Pages Functions own a catch-all host route and pass its native request state to the compiled Fetch dispatcher. The Pages integration remains separate from the Module Worker entrypoint so file-route parameters, middleware data, `next()`, and asset fallback keep their native types and lifecycle. SvelteKit remote functions instead retain their framework-native RPC, caching, and mutation lifecycle while calling the same compiled contract implementation through a zero-network client transport. Astro components and deferred server islands can make the equivalent explicit-context zero-network call while Astro retains its internal island fetch and render protocol. Nuxt's request-aware client transport retains Nitro's SSR-local `$fetch` dispatch and header forwarding while `useAsyncData` remains responsible for payload caching, hydration, and refresh lifecycle.
