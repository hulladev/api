# Greenfield boundary

The executable Standard Schema is the contract. Its input type is the wire representation and its output type is the application representation. Hulla codecs pair a forward Standard Schema with a reverse Standard Schema. Full Zod 4 schemas work directly through their public instance encoding methods. Query declarations use Zod's documented library-author definition model only to compile scalar versus repeated cardinality; value conversion remains owned by codecs and Standard Schema validation.

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

Each arrow exists once per boundary. The server binding contains handlers, context, and per-route middleware stacks. The core Fetch runtime compiles matching, request decoding, middleware execution, and response encoding once. Backend integrations wrap its standard `(Request) => Promise<Response>` boundary and remain responsible only for host-specific concerns such as translating Node HTTP objects, framework lifecycle, connection metadata, and deployment configuration. Route handlers construct their declared responses through `actions.respond()`. Middleware selects status-indexed contract errors through `actions.error()`, using the same underlying response descriptors.

`compileContract()` from `@hulla/api/compiler` is the canonical reflection boundary for integrations. It returns a cached, immutable flat manifest in declaration order. Every entry correlates its structural key, method, fully joined path, accumulated router and route parameter declarations, and original route declaration. Core runtimes and external adapters or generators consume this same representation so path and parameter compilation do not drift between integrations.

The client binding is the corresponding transport primitive. `defineClient()` creates a frozen authoring scope; `build()` returns the contract-shaped callable tree whose leaves perform one Fetch call and return declared HTTP statuses as values. Its transport accepts exactly the standard `Request` value it creates, so `createFetchHandler()` can be supplied directly for in-memory round trips. Like the server scope, it supports a per-request context factory, `middleware()`, and immutable `use()` derivation. Application procedures may compose route leaves with domain behavior, but retries, caching, error policy, and integration state are not part of the core client.

Client and server context types derive from one core route-metadata implementation. Their middleware inputs, `next()` action, branded next result, awaitable behavior, and runtime handler validation are shared as well; binding-specific modules add only client or server semantics.

Operational errors share a structural `code` and Standard Schema-compatible `issues` array. Boundary validation annotates schema issues with its location while retaining validator-specific issue codes and paths. The same issue values can be inspected internally or converted to a JSON-safe `APIProblem`; integrations do not translate between an application error model and a separate validation error model.

Run `bun run bench` to record a local baseline for the complete in-memory Fetch round trip. The result is informational until representative payload fixtures and a direct-Fetch comparison establish a meaningful CI regression budget.

## Declaration shape

Public route and router declarations expose capabilities rather than placeholder fields. A request field such as `params`, `query`, `headers`, or `body` exists only when it is declared; absent fields are omitted instead of being present with an `undefined` value. Concrete inferred types mirror that runtime shape so completion, reflection, and narrowing advertise only usable capabilities. Broad library-facing route and router types retain optional knowledge of those fields for generic traversal.

Router children are direct properties, matching the contract, built client, and server implementation trees. Router structure needed by generic tooling is available through the non-enumerable `$meta` property. Route declarations retain HTTP vocabulary such as `responses`; type and schema helpers provide concise reuse without inventing a second contract shape.

## Dependency rule

The public contract depends only on the Standard Schema specification. Zod remains optional: the main package works without it, while `@hulla/api/zod` has an optional Zod 4 peer and exposes native Zod codecs plus route input composition. Validator-specific composition stays outside the Standard Schema core so the result retains its library's native modification APIs. Client and server bindings depend on the small validation interface and Web Fetch types. Nothing in the active package depends on Node, a server framework, a database, a query library, or the legacy implementation.
