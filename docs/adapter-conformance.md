# Adapter behavior and ownership

All adapters use the shared route executor for contract input/output validation, context and middleware. Native routers retain host routing semantics.

| Boundary | Routing / HEAD | Body ownership and limits | Cancellation |
|---|---|---|---|
| Fetch and Fetch-based framework wrappers | Core static-path precedence, then method; explicit HEAD declarations; 404/405 from core | Owned reader: no library-imposed default cap; optional preservation | Native Request signal; returned streams close their producer on cancel |
| Node HTTP | Core routing; HEAD executes GET and suppresses the body | Owned reader: opt-in byte limit, actual chunk count | Disconnect aborts portable signal and closes stream/reader |
| Express | Express routing and HEAD fallback | Configure Express parser limits; parsed body reused | Disconnect aborts portable signal; shared Node writer |
| Fastify | Fastify routing and HEAD configuration | Configure host `bodyLimit`; parsed body reused | Disconnect aborts the portable signal through the shared Node lifetime helper |
| H3 | H3 routing and HEAD behavior | Owned reader: no library-imposed default cap; optional preservation | Native Request signal and shared Fetch stream writer |
| Hono | Hono routing and HEAD behavior | Owned reader: opt-in byte limit; earlier host parsers retain host limits | Native Request signal and shared Fetch stream writer |
| Elysia | Elysia routing and HEAD behavior | Owned reader: opt-in byte limit; earlier parsed bodies retain host limits | Native Request signal and shared Fetch stream writer |
| In-process | Contract route selection and core executor | Application values; no byte serialization or byte limit | Caller signal; returned iterable ownership |
| MessagePort | Contract path/method through core | Structured-clone wire protocol; configure bridge-level message limits | Request cancel and endpoint closure propagate to pending work/streams |
| AWS Lambda / Azure Functions | Core dispatch after host extraction | Host already buffered the request; configure platform limits | Host-dependent; no client-disconnect guarantee |

A static route for one method can shadow a parameter route for another method under core routing. Do not rely on identical overlap resolution in every native router; use unambiguous route layouts for portable deployment. Native mounts should be tested through their actual router, not only a mocked reply object.

Adapter-owned body readers impose no byte cap by default. Set `maxBodyBytes` explicitly on Fetch, Node HTTP, H3, Hono or
Elysia to opt into a limit. Existing host/parser/platform limits still apply. Conformance verifies explicitly configured
limits rather than requiring a shared default across hosts.

Query input uses absent fields, scalar singleton fields and arrays for repeated fields across Fetch and in-process execution. In-process normalization copies only when needed and never round-trips through URL or JSON text. Binary, FormData and structured application values remain transport-owned; raw native Response bodies are not universally portable.

The shared Fetch and Node response writers notify `onError` for native serialization errors and late stream failures. A response can be replaced before commitment. After commitment a hook is observational and cannot change the already-sent status. Framework-owned serialization outside those writers follows that host's error policy.

Cancellation is cooperative. Passing `signal` makes downstream work cancellable; it cannot terminate arbitrary user promises. Consumers must exhaust streams or explicitly return/cancel them. The package closes transport-owned streams when decoding fails, when a socket disconnects, and when an IPC endpoint closes.

## Executable conformance

[`scripts/adapter-conformance.ts`](../scripts/adapter-conformance.ts) registers the same contract and assertions for each
host. Supply `open(implementation)` returning a client transport, a cleanup function, and an optional HTTP request
function. Each test gets a fresh implementation, context counter, middleware trace, and host. Cleanup runs after each
test, including failures. [`scripts/conformance-http.ts`](../scripts/conformance-http.ts) provides real ephemeral TCP
servers for Node-based hosts so response backpressure and disconnects reach their native writers.

The shared cases cover encoded path parameters, singleton/repeated query fields, per-request context, middleware order,
JSON/text/bytes/empty responses, multipart repeated fields and file bytes, separate `Set-Cookie` values, declared errors
in both client modes, malformed JSON and recovery, cooperative cancellation, full stream consumption, early return, and
late producer failure. Keep native context, routing, body-limit and platform-specific lifecycle tests alongside this suite;
passing the portable laws does not prove every host feature.

| Execution path | Shared suite entry | Explicit host difference |
|---|---|---|
| Fetch | [transport-conformance.test.ts](../packages/message-port/tests/transport-conformance.test.ts) | Uses native Request/Response without a network socket |
| In-process | [transport-conformance.test.ts](../packages/message-port/tests/transport-conformance.test.ts) | No malformed JSON text scenario: input is already an application value |
| MessagePort | [transport-conformance.test.ts](../packages/message-port/tests/transport-conformance.test.ts) | No malformed JSON text scenario: messages use structured clone |
| Node HTTP | [conformance.test.ts](../packages/node-http/tests/conformance.test.ts) | Real TCP server |
| Express | [conformance.test.ts](../packages/express/tests/conformance.test.ts) | Real TCP server; multipart parser is application-owned |
| Fastify | [conformance.test.ts](../packages/fastify/tests/conformance.test.ts) | Real TCP server; multipart requires a host plugin |
| Hono | [conformance.test.ts](../packages/hono/tests/conformance.test.ts) | Native router and Fetch handler |
| H3 | [conformance.test.ts](../packages/h3/tests/conformance.test.ts) | Safe native parameter decoding preserves `%2F` instead of producing `/` |
| Elysia | [conformance.test.ts](../packages/elysia/tests/conformance.test.ts) | Native router and Fetch handler |

A capability must be `true` or a concrete explanation. Unsupported scenarios appear as named exclusions in test output;
do not silently drop assertions or catch failures to make an integration pass. The encoded-slash exception asserts H3's
specific returned value. Any new exception must also be explained in this matrix and the host's documentation.

Run a native adapter's shared suite with `bun x vitest run packages/<adapter>/tests/conformance.test.ts`, or the three
transport suites with `bun x vitest run packages/message-port/tests/transport-conformance.test.ts`. Build core first when
running directly from a clean checkout. Normal package tests run these files automatically, and Turbo tracks changes to
both shared helpers.

## Remaining host boundaries and evidence

The following packages have their own host tests; they do not yet register the shared suite above. This distinction is
intentional evidence tracking, not an assertion that every platform shares identical transport semantics.

| Integration | Representations and streaming boundary | Routing / host ownership | Existing host evidence |
|---|---|---|---|
| Cloudflare Workers / Pages | Fetch representations and Web streams | Worker `fetch` / Pages file routing; native bindings and execution context | [Tests](../packages/cloudflare/tests) |
| AWS Lambda | Payload v2 base64/text input; response streams are collected into a buffered proxy result | HTTP API v2 / Function URL event; platform owns request limits and invocation lifetime | [Tests](../packages/aws-lambda/tests) |
| Azure Functions | Native HTTP request/result mapping; byte streams passed as async iterables | Functions v4 HTTP trigger; host owns buffering and lifetime | [Tests](../packages/azure-functions/tests) |
| Google Cloud functions | Buffered `rawBody` input when provided; shared Node streaming response writer | Functions Framework request/response context and platform request limits | [Tests](../packages/google-cloud-functions/tests) |
| Netlify Functions | Fetch representations and Web streams | Web-native synchronous Functions context and platform deployment | [Tests](../packages/netlify-functions/tests) |
| Next.js | Fetch representations | App Router; rejects `QUERY`; request context and Data Cache belong to Next | [Production fixture](../packages/next/tests/next-build.test.ts) |
| TanStack Start | Fetch representations | Wildcard server routes; rejects `QUERY`; loader and hydration lifecycle belong to Start | [Production fixture](../packages/tanstack-start/tests/start-build.test.ts) |
| React Router | Fetch representations | Resource routes; rejects `QUERY`; HEAD dispatches GET and suppresses its body | [Production fixture](../packages/react-router/tests/react-router-build.test.ts) |
| SolidStart | Fetch representations | API routes; rejects `QUERY`; native event and GET/HEAD mapping | [Production fixture](../packages/solid-start/tests/solid-start-build.test.ts) |
| SvelteKit | Fetch endpoints and colocated remote-function transport | Rejects `QUERY`; native RequestEvent and remote-function lifecycle | [Production fixture](../packages/sveltekit/tests/sveltekit-build.test.ts) |
| Nuxt | Nitro HTTP and request-aware client transport | Rejects `QUERY`; native H3 event, HEAD mapping and SSR request state | [Production fixture](../packages/nuxt/tests/nuxt-build.test.ts) |
| Astro | Fetch endpoints and explicit-context in-process calls | Native APIContext, HEAD mapping and server-island lifecycle | [Production fixture](../packages/astro/tests/astro-build.test.ts) |

For Fetch-derived wrappers, the shared executor does not independently verify the wrapper's host-context extraction,
method mapping, credentials, deployment configuration, or rendering boundary. Those remain host-fixture responsibilities.
Raw native response objects are transport-specific; a buffered platform response must not be advertised as live streaming.

## Published consumers and compatibility

`bun run check:packages` checks every publishable package after `bun run build`. It creates actual package tarballs and
installs each package in its own temporary directory outside the repository, together with packed core, its declared peers,
and a consumer Node type environment. It audits imports in emitted JavaScript and declarations against the package's
own dependency declarations, resolves published declaration imports, emits consumer declarations, imports the built
entrypoints under Node, and executes a core client/server roundtrip. Temporary consumers are removed even after failure.

Express, Node HTTP, MessagePort, WebSocket, NestJS, Next, Nuxt, Astro and Netlify also have dedicated
[packed consumer fixtures](../scripts/package-consumers). These exercise adapter mounting/native context or transport
execution with the same installed core instance. Express additionally checks cookies, HEAD and malformed JSON.
The SvelteKit remote entrypoint's `$app/server` runtime import is verified by its framework production fixture; its
published declaration surface is still checked by the isolated consumer. External library declaration internals use
`skipLibCheck`; our emitted import resolution and consumer declaration emission are checked explicitly.

[`scripts/check-packages.ts`](../scripts/check-packages.ts) owns the host-major profiles and emits the CI matrix with
`--matrix`. Adding a multi-major peer range without profiles for every advertised major fails the package check.

| Check | Versions selected | Evidence produced |
|---|---|---|
| Baseline packed packages | Locally installed peer versions from the workspace lockfile | All published entrypoints and dedicated fixtures listed above |
| Express | Exact Express 4.18.0 / types 4.17.25; latest matching Express 5 / types 5 | Real TCP roundtrip, native context, cookies, HEAD, malformed JSON, declarations |
| Next | Latest matching major 15 and 16 | Native NextRequest, mounted route handler and declarations |
| Nuxt | Latest matching major 3 and 4 | Installed Nuxt peer, H3 handler execution and declarations |
| Astro | Latest matching major 5, 6 and 7 | Native APIRoute type compatibility, minimal APIContext endpoint and colocated transport |
| Netlify | Latest matching Functions major 4 and 5 | Native Context type compatibility and handler execution |
| Portable Node runtime | 22.18.0, 24.11.0 and latest 26.x | Core and MessagePort laws plus native adapter tests, including shared conformance |

These host-major smoke checks complement production fixtures at the locked development version. They do not claim to
build a complete application on every historical minor version or simulate cloud deployment. Profiles log the actual
resolved peer versions so failures can be reproduced. Run one with
`bun run check:compatibility --profile=express-4`, or one baseline package with
`bun run check:packages --package=node-http`. CI uses Node 24 for host-major consumers; the portable runtime has its own
Node matrix. A failing compatibility assertion must be fixed or the advertised peer range narrowed with documented evidence.

## Adapter and transport completion checklist

Before calling a new integration complete:

- **Public boundary:** export a stable package/subpath, use the shared runtime, preserve typed native context, and verify
  complete implementations and fragments. Ensure the public declaration can be emitted by a consumer.
- **Portable laws:** register the shared suite through the real host/router. Record every unsupported capability and
  parameter-decoding difference with a specific reason and an assertion where applicable.
- **Representation ownership:** verify JSON, text, bytes, multipart fields/files, empty results, response headers/cookies,
  streams and raw responses where supported. Document who parses the body, enforces byte limits and owns unread bodies.
- **Routing:** test base paths, encoded parameters, static/parameter overlap, unsupported methods, 404/405, HEAD body
  suppression and host middleware/fallback behavior. Preserve and document native semantics.
- **Lifetime and errors:** test malformed input, declared and unexpected errors, cooperative cancellation, disconnects,
  early stream return, late producer failure, cleanup, and error-hook behavior before/after response commitment.
- **Native context:** exercise request/event extraction, middleware state, per-request isolation and incompatible-adapter
  rejection through host-level tests; portable context tests alone are insufficient.
- **Production consumption:** provide a runnable production fixture where the framework has a build/rendering boundary.
  Verify browser/server separation, request-scoped authentication/context and SSR/hydration behavior where relevant.
- **Published package:** pass `check:packages`, including import ownership, extracted tarball resolution and consumer
  declarations. Add a dedicated packed consumer when the adapter introduces a new native or runtime boundary.
- **Compatibility:** declare supported runtimes/host versions and add relevant CI profiles. Keep major-version smoke
  evidence separate from production-build and platform-deployment evidence.
- **Documentation:** add the package to this matrix and document setup, representations, limits, routing, cancellation,
  native context, unsupported features, and the commands that reproduce its verification.

The same checklist applies when extending an existing adapter with a new transport or runtime mode. Keep application-owned
features such as authentication policy, retry policy and cache invalidation in application/framework composition.

## Additional native integrations

- WebSocket runs the shared suite over real sockets, including multipart wire values, pull-driven streams and cancellation.
  Malformed HTTP JSON is inapplicable; dedicated tests reject malformed wire messages and cover disconnect cleanup.
- NestJS runs the shared suite on Express and Fastify. Multipart parsing remains host/plugin-owned and is explicitly excluded.
  Native tests cover request-scoped DI, guards, interceptors, metadata, prefixes and fragments. Packed consumers exercise
  both platform adapters against NestJS 11 and 12.
- Bun and Deno fixtures use real HTTP servers. The Vercel fixture checks the built Web Handler locally; it does not certify
  a cloud deployment. All three cover byte bodies above 1 MiB, cookies, streaming and routing. Run
  `bun run check:runtimes`, or `npm exec --yes --package=deno@2.9.6 -- bun run check:runtimes --deno`.

See [WebSocket](./websocket.md), [NestJS](./nestjs.md) and [runtime hosts](./runtime-hosts.md) for ownership and setup.

## Koa and desktop bridges

Koa 3 uses the shared suite over real TCP plus native tests for typed state, upstream middleware, parsed-body reuse,
limits, HEAD and 404/405 behavior. Its terminal middleware uses core routing and leaves response commitment to Koa.
See [Koa](./koa.md) for ownership and commands.

Desktop string relays run the MessagePort laws through JSON encoding. Tauri and Dioxus lifecycle tests simulate the
native channel boundary; they are not packaged native-app tests. Electron reuses the existing EventTarget/EventEmitter
MessagePort implementation. See [desktop bridges](./desktop-bridges.md) for native setup and lifecycle responsibilities.
