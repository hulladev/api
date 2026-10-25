# WebSocket

`@hulla/api-websocket` sends client calls and responses over a WebSocket connection. Connect it to your application's socket to make typed calls or read streamed responses.

## Install the transport

This guide uses `ws` to host a Node.js server. Browser clients can use the native `WebSocket` without installing `ws`.

<!-- docs:package-manager -->

```sh
# Bun
bun add @hulla/api @hulla/api-websocket ws

# npm
npm install @hulla/api @hulla/api-websocket ws

# pnpm
pnpm add @hulla/api @hulla/api-websocket ws

# Yarn
yarn add @hulla/api @hulla/api-websocket ws
```

## Run one call over an accepted socket

This example starts a local `ws` server, mounts one API session on the accepted socket, and prints the response from a client call.

```ts filename="src/api/websocket-demo.ts"
import { once } from "node:events";
import { defineContract, request, response, route } from "@hulla/api";
import { createClient } from "@hulla/api/client";
import { defineServer } from "@hulla/api/server";
import { webSocketAdapter, webSocketTransport } from "@hulla/api-websocket";
import {
  WebSocket,
  WebSocketServer,
  type WebSocket as AcceptedSocket,
} from "ws";

const contract = defineContract({
  routes: {
    echo: route.post("/echo", {
      body: request.text(),
      responses: { 200: response.text() },
    }),
  },
});

const implementation = defineServer(contract).implement({
  echo: ({ body }) => ({ status: 200, body: `echo: ${body}` }),
});

const host = new WebSocketServer({ host: "127.0.0.1", port: 0 });
await once(host, "listening");

const address = host.address();
if (address === null || typeof address === "string") {
  throw new Error("Expected a TCP address");
}

const accepted = once(host, "connection") as Promise<[AcceptedSocket]>;
const socket = new WebSocket(`ws://127.0.0.1:${address.port}`);
const transport = webSocketTransport(socket);
const [acceptedSocket] = await accepted;
const server = webSocketAdapter(acceptedSocket).mount(implementation);
const client = createClient(contract, { transport });

try {
  await Promise.all([server.ready, transport.ready]);

  const result = await client.echo({ body: "hello" });
  console.log(result.body); // "echo: hello"
} finally {
  await transport.close();
  await server.close();
  socket.close();
  acceptedSocket.close();

  await new Promise<void>((resolve, reject) => {
    host.close((error) => (error ? reject(error) : resolve()));
  });
}
```

`webSocketAdapter()` receives an already accepted socket. It does not perform the HTTP upgrade or authenticate the connection. Authenticate and authorize the connection before mounting the implementation. `webSocketTransport()` may receive a connecting browser or `ws` socket; calls wait for it to open.

## Keep socket ownership in the application

Create one API session per dedicated socket. Mount the adapter once for every accepted server socket and create one transport for each client socket.

The application owns:

- socket creation, upgrade routing, and TLS;
- authentication, authorization, and origin checks;
- connection limits and host timeouts;
- reconnect and retry policy;
- final socket shutdown.

`transport.close()` and `server.close()` stop the API session, cancel active work, and remove package listeners. They do not call the supplied socket's `close()` or `terminate()` method.

| Member    | Behavior                                                                    |
| --------- | --------------------------------------------------------------------------- |
| `ready`   | Resolves when the socket is open; rejects if the session ends first         |
| `closed`  | Resolves with the terminal `Error`; it does not reject                      |
| `close()` | Stops the API session and releases its listeners without closing the socket |

A closed session cannot be reused. The package never replays a request after an abort, disconnect, or application reconnect. A call aborted while the socket is connecting rejects immediately and is not sent when the socket later opens.

## Send portable values

Requests support JSON, text, bytes, and form data. Responses support those representations plus empty bodies, pull-driven streams, and the transport-native `raw` representation described below.

The wire format carries finite JSON values, `undefined`, arrays, plain records, `Uint8Array`, and `FormData`. Bytes use tagged base64 containers; file entries retain their bytes, name, media type, and modification time. Cycles, non-finite numbers, arbitrary class instances, native `Response` objects, and other host-specific objects are rejected. Use a contract codec for dates, classes, or another application value with a portable wire representation.

`response.raw()` is transport-native. A WebSocket raw response exposes the protocol frame, not a native HTTP `Response` or a portable body value. Status and headers are contract metadata inside that frame; they do not become browser HTTP headers or cookies.

Both peers must speak the `@hulla/api-websocket` protocol. `WEBSOCKET_PROTOCOL` identifies the envelope inside each frame; it is not a `Sec-WebSocket-Protocol` negotiation value, and this package is not a generic WebSocket message client.

## Stream and cancel work

WebSocket response streams are pull-driven. Each `iterator.next()` asks the server producer for one chunk. Unformatted producers must yield `Uint8Array`; formatted streams must encode each item to bytes before it crosses the transport.

The client cancels remote work when:

- its request signal aborts;
- the consumer returns from the iterator early;
- the response is disposed;
- the API session closes; or
- the socket disconnects.

The server aborts the request signal and calls the producer iterator's `return()` method when available. Producers should observe that signal around database, file, or network waits. Disconnects and late producer failures reject outstanding stream reads.

If a consumer stops reading before a stream ends, return its iterator or dispose the response. Merely dropping the stream value does not cancel the server producer.

## Handle failures at the right boundary

Declared contract responses follow the client's configured error mode: the default returns a status-discriminated result, while `errorMode: 'throw'` throws a declared error. Unexpected adapter failures can be observed or replaced through `onError`:

```ts
const adapter = webSocketAdapter(acceptedSocket, {
  onError({ error, phase, request, defaultResponse }) {
    console.error(phase, request.path, error);
    return defaultResponse;
  },
});

const server = adapter.mount(implementation);
```

The hook covers the shared adapter pipeline after protocol-envelope validation: route input decoding, routing, context, middleware, handlers, and response serialization. Malformed envelopes, duplicate request IDs, unsupported frame data, and socket send or close failures remain transport-level failures outside this hook.

Upgrade and authentication failures happen before mounting and remain host concerns. A mount-level `onError` overrides the adapter default; passing `onError: undefined` disables an inherited hook.

Session, protocol, and remote-operation failures are exposed as `WebSocketTransportError`. An aborted call rejects with its signal reason, and local wire-encoding failures can reject with `TypeError`:

| Code              | Meaning                                                                  |
| ----------------- | ------------------------------------------------------------------------ |
| `closed`          | The socket or API session closed, failed, or could not send              |
| `invalid-message` | A JSON value, protocol envelope, response, or stream chunk was malformed |
| `remote-error`    | The server reported an operation-level failure                           |

Malformed protocol input terminates the session, so pending calls and active streams fail with the same terminal error.

## Use browser and server socket implementations

The package has no runtime WebSocket dependency. It accepts a browser-compatible surface with `readyState`, `send()`, `addEventListener()`, and `removeEventListener()`. Native browser sockets and `ws` sockets satisfy that surface; other server runtimes can supply their own compatible accepted socket.

For general contract values and codecs, see [value round trips](./value-round-trips.md). Use [MessagePort](./message-port.md) for workers and local IPC rather than a network socket.
