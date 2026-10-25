# Adapter behavior

Adapters connect your implementation to a server or framework. They all run contract validation and server middleware, but they differ in how they match routes, read request bodies, and handle cancellation.

Compare those differences below. For installation and a working route, follow the linked adapter page.

## Choose an execution boundary

The boundary determines which values cross between your client and implementation, and which side controls the request lifecycle.

| Boundary                           | What crosses it                                                                      | Who owns the lifecycle                                                                                       |
| ---------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| Fetch-based HTTP                   | Web `Request` and `Response`, including Web Streams                                  | The server or framework receives the request; `@hulla/api` handles declared contract routes.                 |
| Node HTTP and framework middleware | Host request and response objects, with a shared Node response writer                | The host owns parsing and response commitment; the adapter connects the host request to the shared executor. |
| In-process                         | Application values passed directly to the implementation                             | The caller owns invocation and cleanup. Values are not serialized through a URL or JSON body.                |
| MessagePort                        | Structured-clone messages, with explicit encodings for form data, files, and streams | The bridge owns message delivery and endpoint lifetime.                                                      |
| Tauri and Dioxus desktop bridges   | JSON-compatible string messages with explicit encodings for bytes and form data      | The bridge owns message delivery and endpoint lifetime.                                                      |

Fetch adapters are a good fit when the host already speaks the Web Request/Response API. Choose an in-process call when client and implementation run in the same process and you want to avoid a serialization boundary. Choose MessagePort when both sides communicate through a MessagePort; desktop bridges use their own string protocol.

## What stays consistent across adapters?

The shared executor applies the contract's input and output validation and runs the implementation's middleware. Adapters pass the parsed request data and host context into that execution. A declared error response is part of the contract result; an unexpected exception follows the adapter's error handling and the host's response lifecycle.

Transport representation is not identical across boundaries. HTTP adapters work with headers and encoded request bodies. In-process calls pass application values directly. MessagePort uses structured clone, with explicit handling for `FormData`, files, and streams. Tauri and Dioxus bridges encode supported values into JSON-compatible strings, including explicit encodings for bytes and form data. A raw native `Response` or other host-specific object is not portable across all transports; use declared response bodies when callers may use different transports.

For HTTP query inputs, absent fields remain absent, a single value is represented as a scalar, and repeated values are represented as arrays. In-process execution preserves application values and does not convert them to URL parameters first.

## Where does routing come from?

Some adapters register each contract route with the host's router. Others mount a handler and let the shared executor select the route. In either case, the host can affect route matching and fallback behavior.

| Adapter group                                                              | Routing behavior to account for                                                                                                                                                                                                                                                                                                                                  |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Core dispatch, Node HTTP, and Koa                                          | The shared router selects contract routes. A static route for one method can take precedence over a parameter route for another method, so keep overlapping route layouts unambiguous. `HEAD` runs the matching `GET` route and suppresses its response body. Koa mounts the handler as terminal middleware; scope it with the application's router when needed. |
| Express, Fastify, Hono, H3, Elysia, NestJS                                 | Routes are mounted into native host routing. Native middleware, prefixes, fallbacks, and `HEAD` behavior can affect the result. Test the mounted handler through the host router when route overlap or fallback matters.                                                                                                                                         |
| Next.js, TanStack Start, React Router, SolidStart, SvelteKit endpoints, Nuxt         | The integration maps contract routes into the framework's route-handler model. These integrations reject `QUERY` routes at adapter creation because their supported route APIs do not register them. React Router maps `HEAD` to `GET` and suppresses the body.                                                                                                  |
| Lambda and other event-based functions                                     | The adapter dispatches after extracting the method and path from the platform event. The platform controls event shape and invocation behavior.                                                                                                                                                                                                                  |

`QUERY` is supported by core dispatch and several native adapters, including Express, Fastify, Hono, H3, Elysia, and Cloudflare. Framework route APIs that do not support it reject implementations containing `QUERY` routes rather than silently omitting those routes. NestJS mounts generated controller routes into its native host router, but its controller generator also rejects `QUERY`. SvelteKit's endpoint adapter rejects `QUERY`, while its [remote-function transport](./sveltekit-remote-functions.md) can execute one inside a SvelteKit remote callback. Check the specific adapter guide if your contract uses `QUERY`.

H3 preserves an encoded slash such as `%2F` in a decoded route parameter where other routers may decode it to `/`. If route parameter values must match across hosts, avoid encoding `/` into a path segment or account for the H3 behavior explicitly.

## Who reads and limits request bodies?

Body ownership determines which parser creates the value that contract validation sees and which setting limits the bytes read.

| Adapter                                 | Body handling and limits                                                                                                                                                                    |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fetch, Node HTTP, H3, Hono, Elysia, Koa | The adapter can read the request body. Set `maxBodyBytes` to impose an adapter-level byte limit; the default is no adapter-imposed cap. Host, proxy, or platform limits may still apply.    |
| Express, Fastify                        | Configure the host parser or plugin's limits. The adapter reuses the host-parsed body. Multipart parsing requires host middleware or a plugin where the host does not provide it.           |
| NestJS                                  | The adapter maps the request body exposed by the Nest platform adapter. Body parsing and size limits remain with Express or Fastify underneath NestJS; configure that host's parser/plugin. |
| AWS Lambda                              | The adapter reads the request from the HTTP API v2 / Function URL event body. The platform has already supplied the event, so configure platform request-size limits.                       |
| Azure Functions                         | The adapter reads JSON, text, bytes, or form data through the Functions `HttpRequest` methods. Configure request-size limits in the host/platform.                                          |
| Google Cloud Run functions              | The adapter uses `rawBody` when present and otherwise maps the framework-parsed body. Platform request limits still apply.                                                                  |
| In-process                              | The caller passes an application value. There is no byte decoding or byte-size limit at this boundary.                                                                                      |
| MessagePort                             | Values cross through structured clone; configure limits at the bridge or application boundary if message size needs a cap.                                                                  |

For example, an Express application should configure its JSON or multipart parser before the mounted adapter. Setting an HTTP adapter's `maxBodyBytes` does not replace an earlier host parser's own limit, and adapters that reuse parsed bodies do not re-read those bytes to apply their own cap.

Request representations such as JSON, text, bytes, and form data are decoded according to the contract and transport. Multipart field repetition and file bytes are preserved by supported HTTP and MessagePort paths, but the parser that creates `FormData` remains host-owned in middleware-based integrations.

## What happens to responses and errors?

Fetch-based adapters return native `Response` objects and use Web Streams for streaming bodies. Node HTTP and related integrations write through the host response. AWS Lambda collects a declared response stream into the buffered proxy response body; Azure Functions returns the stream as an async iterable. Check the host adapter's response type before relying on incremental delivery.

The shared Fetch and Node response writers call `onError` for serialization failures and late stream failures. If the response has not been committed, the hook can return a replacement response. After headers or body bytes have been sent, the hook can observe the error but cannot replace the response already received by the client. Serialization performed outside these shared writers follows the framework's error policy.

Use `onError` for logging or a host-specific fallback response, and keep expected application failures in declared contract responses. Each adapter exposes host-specific request/context fields to its error callback; see its reference for the exact callback type.

Response headers and cookies also depend on the host boundary. For example, HTTP writers preserve separate `Set-Cookie` values, while an in-process result has no native HTTP header container unless the caller uses the declared response representation.

## How does cancellation reach your code?

Adapters pass an `AbortSignal` to the shared execution context when the host or caller can signal cancellation. Your implementation can pass that signal to downstream APIs or check it during long-running work. Cancellation is cooperative: it cannot stop a promise or other work that ignores the signal.

| Boundary                                                    | Cancellation source and effect                                                                                                                                                   |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fetch, Hono, H3, Elysia, and Fetch-based framework handlers | The incoming `Request.signal` is available to execution. Cancelling a returned stream closes its producer.                                                                       |
| Node HTTP, Express, Fastify, Koa, and NestJS                | The shared Node request-lifetime helper aborts the portable signal when the request is aborted or the response connection closes. The writers also close their stream or reader. |
| MessagePort and desktop bridges                             | Request cancellation and endpoint closure propagate to pending work and streams through the bridge.                                                                              |
| In-process                                                  | The caller supplies the signal and owns returned iterable cleanup.                                                                                                               |
| Serverless functions                                        | Cancellation depends on what the platform exposes. Do not assume a client disconnect reaches the invocation.                                                                     |

If a client stops reading a stream, exhaust it or call its iterator's `return()` / cancel the reader when you no longer need it. Transport-owned streams are closed when decoding fails, a socket disconnects, or an IPC endpoint closes; application work still needs to honor its signal.

## Adapter-specific details

Use the adapter guide for installation, mounting, native context, and exact option types:

- [Node HTTP](./node-http.md)
- [Express](./express.md), [Fastify](./fastify.md), [Hono](./hono.md), [H3](./h3.md), [Elysia](./elysia.md), and [Koa](./koa.md)
- [NestJS](./nestjs.md)
- [Next.js](./next.md), [TanStack Start](./tanstack-start.md), [React Router](./react-router.md), [SolidStart](./solid-start.md), [SvelteKit endpoints](./sveltekit.md), [SvelteKit remote functions](./sveltekit-remote-functions.md), [Nuxt](./nuxt.md), and [Astro](./astro.md)
- [Cloudflare Workers](./cloudflare.md), [Cloudflare Pages Functions](./cloudflare-pages.md),
  [AWS Lambda](./aws-lambda.md), [Azure Functions](./azure-functions.md),
  [Google Cloud Run functions](./google-cloud-functions.md), and [Netlify Functions](./netlify-functions.md)
- [Fetch](https://hulla.dev/docs/api/transports/fetch), [in-process](https://hulla.dev/docs/api/transports/in-process), [MessagePort](./message-port.md), and [WebSocket](./websocket.md)
- [Desktop bridges](./desktop-bridges.md)
