# Greenfield boundary

An ordinary Standard Schema declares one identity representation and validates the same value in both directions. When wire and application values differ, an explicit @hulla/api codec pairs a wire-to-application Standard Schema with its application-to-wire counterpart. `@hulla/api-zod` adapts native Zod codecs and owns Zod query cardinality inference; core never inspects validator-specific properties.

The active milestone centers on the Fetch vertical slice. Framework adapters, generators, query integrations, and database integrations should only return after the directional core proves their required public seams. Procedures remain a small optional application layer and do not participate in HTTP routing. A built procedure tree supplies structural identity for future integrations without introducing a separate declaration/implementation contract.

## Request call graph

```text
application input
  -> schema.encode
  -> representation-specific request serialization
  -> adapter extracts raw request values
  -> core query/body transport normalization
  -> schema.decode
  -> typed handler
  -> server response schema.encode
  -> Response JSON serialization
  -> response.json
  -> client response schema.decode
  -> application output
```

Each arrow exists once per boundary. The server binding contains handlers, context, and per-route middleware stacks. The core runtime compiles route matching, schema capabilities, request decoding, header handling, middleware execution, response encoding, and client response decoding once when a binding is built. Hot calls execute those immutable plans instead of rediscovering schema or representation behavior. Backend integrations may wrap either the standard `(Request) => Promise<Response>` boundary or the lower-level wire dispatcher. They remain responsible only for host-specific concerns such as translating host request objects, framework lifecycle, connection metadata, and deployment configuration. Route handlers construct their declared responses through `actions.respond()`. Middleware selects status-indexed contract errors through `actions.error()`, using the same underlying response descriptors.

`compileContract()` from `@hulla/api/compiler` is the canonical reflection boundary for integrations. It returns a cached, immutable flat manifest in declaration order. Every entry correlates its structural key, method, fully joined path, accumulated router and route parameter declarations, and original route declaration. Core runtimes and external adapters or generators consume this same representation so path and parameter compilation do not drift between integrations.

`@hulla/api/client` supplies the built-in Fetch client. `defineClient()` creates a frozen authoring scope; `build()` returns the contract-shaped callable tree whose leaves perform one Fetch call and return declared HTTP statuses as values. Its transport accepts exactly the standard `Request` value it creates, so `createFetchHandler()` from `@hulla/api/server` can be supplied directly for in-memory round trips. Like the server scope, it supports a per-request context factory, `middleware()`, and immutable `use()` derivation. Application procedures may compose route leaves with domain behavior, but retries, caching, error policy, and integration state are not part of the core client.

Client and server context types derive from one core route-metadata implementation. Their middleware inputs, `next()` action, branded next result, awaitable behavior, runtime guards, and execution dispatcher are shared as well; binding-specific modules add only client or server semantics. Procedures reuse the same execution-step and middleware-dispatch primitives, while retaining their smaller application-only input because they have no HTTP request or route contract.

Operational errors share a structural `code` and Standard Schema-compatible `issues` array. Boundary validation annotates schema issues with its location while retaining validator-specific issue codes and paths. The same issue values can be inspected internally or converted to a JSON-safe `APIProblem`; integrations do not translate between an application error model and a separate validation error model.

Run `bun run bench` to record the standalone comparison matrix. It covers static, small-body, and large-body round trips across Direct Fetch, @hulla/api, tRPC, oRPC, ts-rest, and Hono RPC, plus focused @hulla/api transport, middleware, failure, and streaming scenarios. The terminal shows compact medians and ratios; `benchmarks/results/latest.md` receives the sample-level report.

## Declaration shape

Public route and router declarations expose capabilities rather than placeholder fields. A request field such as `params`, `query`, `headers`, or `body` exists only when it is declared; absent fields are omitted instead of being present with an `undefined` value. Concrete inferred types mirror that runtime shape so completion, reflection, and narrowing advertise only usable capabilities. Broad library-facing route and router types retain optional knowledge of those fields for generic traversal.

Router children are direct properties, matching the contract, built client, and server implementation trees. Router structure needed by generic tooling is available through the non-enumerable `$meta` property. Route declarations retain HTTP vocabulary such as `responses`; type and schema helpers provide concise reuse without inventing a second contract shape.

## Dependency rule

The public contract depends only on the Standard Schema specification. `@hulla/api-zod` owns the optional Zod peer, explicit reversible-schema adaptation, query inference, text codecs, and route-schema composition. `@hulla/api` includes its broadly portable Fetch client and handler behind dedicated subpath exports. `@hulla/api/wire` exposes the normalized server-adapter boundary for framework-specific integrations without making ordinary users install another package.
