# Adapter behavior and ownership

All adapters use the shared route executor for contract input/output validation, context and middleware. Native routers retain host routing semantics.

| Boundary | Routing / HEAD | Body ownership and limits | Cancellation |
|---|---|---|---|
| Fetch and Fetch-based framework wrappers | Core static-path precedence, then method; explicit HEAD declarations; 404/405 from core | Owned reader: 1 MiB default; optional preservation | Native Request signal; returned streams close their producer on cancel |
| Node HTTP | Core routing; HEAD executes GET and suppresses the body | Owned reader: 1 MiB default, actual chunk count | Disconnect aborts portable signal and closes stream/reader |
| Express | Express routing and HEAD fallback | Configure Express parser limits; parsed body reused | Disconnect aborts portable signal; shared Node writer |
| Fastify | Fastify routing and HEAD configuration | Configure host `bodyLimit`; parsed body reused | Disconnect aborts the portable signal through the shared Node lifetime helper |
| H3 | H3 routing and HEAD behavior | Owned reader: 1 MiB default; optional preservation | Native Request signal and shared Fetch stream writer |
| Hono | Hono routing and HEAD behavior | Owned reader: 1 MiB default; earlier host parsers need host limits | Native Request signal and shared Fetch stream writer |
| Elysia | Elysia routing and HEAD behavior | Owned reader: 1 MiB default; earlier parsed bodies use host limits | Native Request signal and shared Fetch stream writer |
| In-process | Contract route selection and core executor | Application values; no byte serialization or byte limit | Caller signal; returned iterable ownership |
| MessagePort | Contract path/method through core | Structured-clone wire protocol; configure bridge-level message limits | Request cancel and endpoint closure propagate to pending work/streams |
| AWS Lambda / Azure Functions | Core dispatch after host extraction | Host already buffered the request; configure platform limits | Host-dependent; no client-disconnect guarantee |

A static route for one method can shadow a parameter route for another method under core routing. Do not rely on identical overlap resolution in every native router; use unambiguous route layouts for portable deployment. Native mounts should be tested through their actual router, not only a mocked reply object.

Query input uses absent fields, scalar singleton fields and arrays for repeated fields across Fetch and in-process execution. In-process normalization copies only when needed and never round-trips through URL or JSON text. Binary, FormData and structured application values remain transport-owned; raw native Response bodies are not universally portable.

The shared Fetch and Node response writers notify `onError` for native serialization errors and late stream failures. A response can be replaced before commitment. After commitment a hook is observational and cannot change the already-sent status. Framework-owned serialization outside those writers follows that host's error policy.

Cancellation is cooperative. Passing `signal` makes downstream work cancellable; it cannot terminate arbitrary user promises. Consumers must exhaust streams or explicitly return/cancel them. The package closes transport-owned streams when decoding fails, when a socket disconnects, and when an IPC endpoint closes.
