# Google Cloud Run functions

`@hulla/api-google-cloud-functions` serves your API through the Node.js Functions Framework. Register the mounted implementation as an HTTP function in your Cloud Run functions project.

## Install the adapter

Use Node.js 22 or later and `@google-cloud/functions-framework` 5.x. This adapter handles HTTP functions; CloudEvent and legacy event signatures need their own handlers.

This guide assumes a Functions Framework project already exists. The example uses Zod for its request and response
schemas.

<!-- docs:package-manager -->

```sh
# Bun
bun add @hulla/api @hulla/api-google-cloud-functions @google-cloud/functions-framework zod

# npm
npm install @hulla/api @hulla/api-google-cloud-functions @google-cloud/functions-framework zod

# pnpm
pnpm add @hulla/api @hulla/api-google-cloud-functions @google-cloud/functions-framework zod

# Yarn
yarn add @hulla/api @hulla/api-google-cloud-functions @google-cloud/functions-framework zod
```

## Mount one HTTP function

Declare the route in a module shared by server and client code:

```ts
// src/api/contract.ts
import { defineContract, response, route } from '@hulla/api'
import { z } from 'zod'

export const contract = defineContract({
  basePath: '/api',
  routes: {
    profile: route.get('/profiles/:id', {
      params: z.object({ id: z.string() }),
      responses: {
        200: response.json(z.object({ id: z.string(), runtime: z.string() })),
      },
    }),
  },
})
```

Implement the route in server-only code:

```ts
// src/api/server.ts
import { defineServer } from '@hulla/api/server'
import { contract } from './contract'

export const implementation = defineServer(contract).implement({
  profile: ({ params, response }) =>
    response(200, {
      id: params.id,
      runtime: 'google-cloud-functions',
    }),
})
```

Mount the implementation and register it under the function entrypoint selected by the deployment:

```ts
// src/index.ts
import { http } from '@google-cloud/functions-framework'
import { googleCloudFunctionsAdapter } from '@hulla/api-google-cloud-functions'
import { implementation } from './api/server'

export const handler = googleCloudFunctionsAdapter().mount(implementation)

http('profileApi', handler)
```

`mount()` returns the Express-style HTTP function. `http()` registers that function with the Functions Framework; the
adapter does not register itself or start a server.

> `profileApi` is an entrypoint name, not a URL prefix. It is selected with deployment configuration or the Functions
> Framework `--target` option and is never added to the contract path.

### Verify the local boundary

Compile the TypeScript entrypoint through the project's normal build, then start the Functions Framework with the
`profileApi` target. A project start script can record that selection:

```json
{
  "scripts": {
    "start": "functions-framework --target=profileApi --signature-type=http"
  }
}
```

With the local framework listening on its default port, call the contract path:

```sh
curl --include http://localhost:8080/api/profiles/user-1
```

The request crosses the actual Functions Framework boundary and returns the declared response:

```text
HTTP/1.1 200 OK
content-type: application/json

{"id":"user-1","runtime":"google-cloud-functions"}
```

Google's [local functions guide](https://cloud.google.com/run/docs/local-dev-functions) covers target selection and
the Functions Framework development server. Because `handler` is exported, another server-side module can also invoke
the same adapter boundary directly.

## Follow the request-to-response lifecycle

For each HTTP invocation:

1. The Functions Framework selects the registered entrypoint and calls `handler(googleRequest, googleResponse)`.
2. The adapter constructs a Web `Request` from the native URL, method, headers, buffered body, and abort signal.
3. `@hulla/api` matches the pathname, decodes and validates declared inputs, creates context, runs middleware, and
   calls the route handler.
4. The shared executor validates the declared result and creates a Web `Response`.
5. The adapter copies the status and headers, writes response chunks to `googleResponse`, and ends the native response.

An unmatched contract path returns `404`; a known path with the wrong method returns `405`. Functions Framework
ignored routes, Google Cloud authentication, ingress, and gateway routing can stop a request before this lifecycle.

## Match the path seen by the function

The adapter builds the Web request URL from `googleRequest.originalUrl` when it is available, then falls back to
`googleRequest.url`. It does not add or remove the function entrypoint, service name, or a gateway prefix.

| Path in `originalUrl`          | Contract `basePath` | Contract route  | Result                            |
| ------------------------------ | ------------------- | --------------- | --------------------------------- |
| `/api/profiles/user-1`         | `/api`              | `/profiles/:id` | Matches with `id = "user-1"`      |
| `/profiles/user-1`             | empty               | `/profiles/:id` | Matches with `id = "user-1"`      |
| `/service/api/profiles/user-1` | `/api`              | `/profiles/:id` | `404`; `/service` was not removed |

When a gateway rewrites the public path, match the contract to the pathname that reaches the function. Logging
`googleRequest.originalUrl` is the quickest way to verify that boundary. Adding a prefix that is absent there, or
assuming `profileApi` appears there, makes every otherwise valid route miss.

## Add Functions Framework state to server context

Use `adapter.context()` when handlers need the execution ID, trace metadata, original native URL, or native response.
Replace the server definition above with an adapter-bound definition, then mount it through the Google adapter:

```ts
// src/api/server.ts
import { googleCloudFunctionsAdapter } from '@hulla/api-google-cloud-functions'
import { defineServer } from '@hulla/api/server'
import { contract } from './contract'

export const adapter = googleCloudFunctionsAdapter()

export const implementation = defineServer(contract, {
  context: adapter.context(({ googleRequest, route }) => ({
    executionId: googleRequest.executionId ?? 'unknown',
    originalUrl: googleRequest.originalUrl ?? googleRequest.url,
    routeKey: route.key.join('.'),
  })),
}).implement({
  profile: ({ context, params, response, signal }) => {
    console.info({
      executionId: context.executionId,
      originalUrl: context.originalUrl,
      route: context.routeKey,
      aborted: signal.aborted,
    })
    return response(200, {
      id: params.id,
      runtime: 'google-cloud-functions',
    })
  },
})
```

The context factory receives three views of the host boundary:

| Value           | Use                                                                                                    |
| --------------- | ------------------------------------------------------------------------------------------------------ |
| `request`       | The Web `Request` used for contract routing and body decoding.                                         |
| `googleRequest` | The native request, including `rawBody`, `executionId`, `spanId`, and `abortController` when supplied. |
| `response`      | The native Express-compatible response written by the adapter.                                         |

Let the adapter own the native response unless an integration deliberately needs to inspect it. Writing headers or
body bytes from context code commits the response before the adapter can serialize the declared route result.

An adapter-native context binds the implementation to `@hulla/api-google-cloud-functions`. Mounting it through a
different adapter fails during setup rather than supplying incompatible native state.

### Respond to framework cancellation

When the Functions Framework supplies `googleRequest.abortController`, the adapter forwards its signal to the Web
`Request` and the portable handler `signal`. Functions Framework 5 aborts that controller when an invocation times out
or its HTTP connection closes. Pass `signal` to cancellable work and release resources when it aborts; it cannot extend
the configured Google Cloud timeout.

## Understand request-body ownership

The Functions Framework reads and parses the native request body before invoking the HTTP function. It also exposes the
original buffered bytes as `rawBody`. The adapter prefers `rawBody`, so contract decoding sees the caller's bytes rather
than a JSON serialization of the parsed object.

| Native request state                                     | Adapter behavior                                                           |
| -------------------------------------------------------- | -------------------------------------------------------------------------- |
| `rawBody` is present                                     | Uses those bytes for JSON, text, bytes, or form-data contract decoding.    |
| `rawBody` is absent and `body` is a Web-compatible value | Uses the string, bytes, `Blob`, `FormData`, or `URLSearchParams` value.    |
| `rawBody` is absent and `body` is another object         | JSON-stringifies the object and removes the stale `content-length` header. |
| Method is `GET` or `HEAD`                                | Constructs the Web request without a body.                                 |

The adapter exposes no `maxBodyBytes` option. Google Cloud, Functions Framework middleware, and any gateway enforce
their limits before or around contract decoding. Consult the current [Cloud Run functions quotas](https://cloud.google.com/functions/quotas)
when request or response size affects the design.

## Write responses and streams to the native response

Every declared result becomes a Web `Response` before the adapter writes it to the Functions Framework response.

| Contract response               | Native write behavior                                                                                        |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Empty                           | Copies status and headers, then ends without body bytes.                                                     |
| JSON, text, bytes, or form data | Reads the Web response body and writes its bytes to the native response.                                     |
| Stream                          | Pulls `Uint8Array` chunks and writes them without collecting the complete stream in the adapter.             |
| Raw                             | Accepts a Web `Response` only when its status matches the declared contract status, then writes it normally. |
| `HEAD` request                  | Executes the corresponding `GET` route, cancels its response body, and sends only status and headers.        |

Multiple `Set-Cookie` headers remain separate. When a native `write()` reports backpressure, the adapter waits for
`drain` before reading the next stream chunk. That preserves backpressure inside the function; an ingress proxy can
still affect when chunks become visible to the caller.

If the native response closes while the adapter is waiting for `drain`, it cancels the Web response reader. A stream
producer failure after headers or chunks have been written cannot be converted into a new HTTP response.

## Observe or replace failures

Pass `onError` to `mount()` to log a failure with both Web and Functions Framework request state:

```ts
// src/index.ts
export const handler = adapter.mount(implementation, {
  onError({ error, phase, googleRequest, defaultResponse }) {
    console.error({
      error,
      phase,
      executionId: googleRequest.executionId,
      path: googleRequest.originalUrl ?? googleRequest.url,
    })
    return defaultResponse
  },
})
```

The hook receives the Web `request`, native `googleRequest` and `response`, optional matched `route`, and a Web
`defaultResponse`. Return it or `undefined` to keep the fallback, or return another Web `Response` to replace it. An
adapter-level hook applies to every mount; a mount-level hook overrides that default for one handler.

Use declared contract responses for expected application outcomes. `onError` observes failures while matching routes,
decoding or validating input, creating context, running middleware or handlers, validating output, or creating the Web
response.

Before the native response is committed, the hook can replace the fallback. After streaming begins, it can only
observe a producer failure; bytes already sent cannot be replaced. A native bridge failure before headers are sent
produces a plain `500 Internal Server Error`; after headers are sent, the adapter destroys the response.

## Keep non-HTTP triggers outside this adapter

CloudEvents, Pub/Sub messages, storage events, schedules, and other event-driven signatures are not `@hulla/api` HTTP
requests. Call the application service that owns those events directly instead of sending them through this adapter.

The adapter returns an HTTP handler. It does not choose the function entrypoint, call `http()`, configure IAM or CORS,
set ingress or concurrency, rewrite gateway paths, change timeouts, or deploy the function. Google's [Cloud Run
functions guide](https://cloud.google.com/run/docs/write-functions) covers the platform-owned registration and
deployment boundary.

## Next steps

- [Server context and middleware](./server-context.md) explains portable context and cancellation.
- [Typed clients](./client-authoring.md) calls the deployed function through the same contract.
- [Server fragments and composition](./server-composition.md) shows how to mount selected route groups.
- [Adapter behavior](./adapter-conformance.md) compares routing, bodies, streaming, and cancellation across hosts.
