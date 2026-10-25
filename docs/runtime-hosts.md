# Web-native runtimes

Bun, Deno, and Vercel can all run a handler that accepts a `Request` and returns a `Response`. Create that handler with `fetchAdapter().mount(implementation)`, then connect it to your host using the examples below.

## Choose the host boundary

| Host   | Register the mounted handler                            | Choose it when                                                                           |
| ------ | ------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Bun    | Pass `handler` to `Bun.serve()`                         | Your application owns the listener and startup code.                                     |
| Deno   | Export `{ fetch: handler }` for `deno serve`            | Deno should own the listener; use `Deno.serve()` when your application must own startup. |
| Vercel | Export `{ fetch: handler }` from a root `api/*.ts` file | Vercel should discover and deploy a standalone Web Handler.                              |

The Bun and Deno rows start a long-running server process. The Vercel row exports a function that Vercel invokes from
its file-based `api` directory. Use a framework or host-specific adapter when the host should own a native router,
parsed body, response writer, or request context instead.

## The shared boundary

Once you have a contract implementation, mounting it is the same on every Fetch-compatible host:

```ts
// src/api/handler.ts
import { fetchAdapter } from '@hulla/api/fetch'
import { implementation } from './server'

export const handler = fetchAdapter().mount(implementation)
```

`handler` receives the complete Web `Request`, matches its method and pathname against the contract, decodes and
validates declared inputs, runs the selected implementation, and returns a Web `Response`. The host then decides how
that function is reached and where the response is sent.

## Ownership at a glance

`@hulla/api` owns the portable request lifecycle:

- contract route selection, including normal `404` and `405` responses;
- declared parameter, query, header, and body decoding and validation;
- server context and handler execution;
- declared response encoding and headers;
- propagation of the Web request's cancellation signal to portable handler code.

The host owns everything around that handler:

- listener or function discovery and public path mapping;
- ports, TLS, deployment, authentication, and platform logging;
- body-size, duration, concurrency, streaming, and cancellation behavior;
- host-native values that are not part of a Web `Request`.

Read the [Fetch transport guide](/docs/api/transports/fetch) for adapter options such as `maxBodyBytes` and
`preserveRequestBody`. Then choose a host-specific setup:

- [Bun](./bun.md) mounts the handler in `Bun.serve` and verifies it with a local HTTP request.
- [Deno](./deno.md) exports the handler for `deno serve` and keeps additional runtime permissions explicit.
- [Vercel Functions](./vercel.md) exports the handler from a root `api` file and aligns file routing with the contract path.
