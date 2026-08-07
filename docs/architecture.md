# Greenfield boundary

The executable Standard Schema is the contract. Its input type is the wire representation and its output type is the application representation. Hulla codecs pair a forward Standard Schema with a reverse Standard Schema. Full Zod 4 schemas work directly through their public instance encoding methods. Query declarations use Zod's documented library-author definition model only to compile scalar versus repeated cardinality; value conversion remains owned by codecs and Standard Schema validation.

The active milestone deliberately stops after the Fetch vertical slice. Framework adapters, local procedures, generators, query integrations, and database integrations should only return after the directional core proves their required public seams.

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

Each arrow exists once per boundary. The server binding contains only handlers, context, and per-route middleware stacks. Backend integrations own transport routing, serialization, and any startup compilation required by their framework. Route handlers construct their declared responses through `actions.respond()`. Middleware selects status-indexed contract errors through `actions.error()`, using the same underlying response descriptors.

Run `bun run bench` to record a local baseline for the complete in-memory Fetch round trip. The result is informational until representative payload fixtures and a direct-Fetch comparison establish a meaningful CI regression budget.

## Dependency rule

The public contract depends only on the Standard Schema specification. Zod remains optional: the main package works without it, while `@hulla/api/zod` has an optional Zod 4 peer and exposes native Zod codecs. Client and server bindings depend on the small validation interface and Web Fetch types. Nothing in the active package depends on Node, a server framework, a database, a query library, or the legacy implementation.
