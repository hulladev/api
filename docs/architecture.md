# Greenfield boundary

The executable Standard Schema is the contract. Its input type is the wire representation and its output type is the application representation. Hulla codecs pair a forward Standard Schema with a reverse Standard Schema. Full Zod 4 schemas work directly through their public instance encoding methods. The runtime never walks private schema-library internals and never performs a second rich-value serialization pass.

The active milestone deliberately stops after the Fetch vertical slice. Framework adapters, local procedures, generators, query integrations, and database integrations should only return after the directional core proves their required public seams.

## Request call graph

```text
application input
  -> client schema.encode
  -> JSON.stringify / fetch
  -> Request.json
  -> server schema.decode
  -> typed handler
  -> server response schema.encode
  -> Response JSON serialization
  -> response.json
  -> client response schema.decode
  -> application output
```

Each arrow exists once per boundary. Routes, schema adapters, path patterns, and handler lookups are compiled when the server binder or client is created—not per request.

Run `bun run bench` to record a local baseline for the complete in-memory Fetch round trip. The result is informational until representative payload fixtures and a direct-Fetch comparison establish a meaningful CI regression budget.

## Dependency rule

The public contract depends only on the type-only Standard Schema specification. Validation libraries such as Zod are consumer choices and development fixtures, not runtime or peer dependencies. Client and server bindings depend on the small validation interface and Web Fetch types. Nothing in the active package depends on Node, a server framework, a database, a query library, or the legacy implementation.
