# Message-port transport

`@hulla/api-message-port` lets a client call an API running in a worker or another process through a message channel. Connect both ends of the channel, then use the client as you would over HTTP.

## Install the transport

<!-- docs:package-manager -->

```sh
# Bun
bun add @hulla/api @hulla/api-message-port

# npm
npm install @hulla/api @hulla/api-message-port

# pnpm
pnpm add @hulla/api @hulla/api-message-port

# Yarn
yarn add @hulla/api @hulla/api-message-port
```

## Run one call across a `MessageChannel`

This Node.js example creates both ends of a channel, mounts a server on one port, and calls it from the other. Browser and worker runtimes expose `MessageChannel` globally, so omit the Node import there.

```ts filename="src/api/message-port-demo.ts"
import { MessageChannel } from "node:worker_threads";
import { defineContract, response, route } from "@hulla/api";
import { createClient } from "@hulla/api/client";
import { defineServer } from "@hulla/api/server";
import {
  messagePortAdapter,
  messagePortTransport,
} from "@hulla/api-message-port";

const contract = defineContract({
  routes: {
    health: route.get("/health", {
      responses: { 200: response.text() },
    }),
  },
});

const implementation = defineServer(contract).implement({
  health: () => ({ status: 200, body: "ok" }),
});

const channel = new MessageChannel();
const server = messagePortAdapter(channel.port1).mount(implementation);
const transport = messagePortTransport(channel.port2);

try {
  await Promise.all([server.ready, transport.ready]);

  const client = createClient(contract, { transport });
  const result = await client.health();

  console.log(result.body); // "ok"
} finally {
  await transport.close();
  await server.close();
  channel.port1.close();
  channel.port2.close();
}
```

`messagePortAdapter()` receives the server-side endpoint. `messagePortTransport()` supplies the client transport. The client still returns the contract's status-discriminated result; only the route between client and implementation has changed.

## Choose the endpoint shape

| Boundary                                                        | What to pass                                                        |
| --------------------------------------------------------------- | ------------------------------------------------------------------- |
| Browser, worker, or Node.js `MessagePort`                       | Pass the port directly                                              |
| Electron `MessagePortMain` or transferred renderer port         | Pass the port directly, or normalize it with `electronEndpoint()`   |
| Ordered IPC that preserves structured messages and `Uint8Array` | Implement `MessageEndpoint`                                         |
| Tauri, Dioxus, or another ordered string relay                  | Use a helper from the [desktop bridges](./desktop-bridges.md) guide |

Native ports may expose DOM-style listeners or EventEmitter-style `on`/`off` listeners. The package normalizes both and calls `start()` when the port provides it.

A custom structured endpoint has two operations. In an adapter module where `bridge` is your application-owned ordered IPC object:

```ts
import type { MessageEndpoint } from "@hulla/api-message-port";

const endpoint: MessageEndpoint = {
  send: (message) => bridge.send(message),
  subscribe: (listener) => bridge.subscribe(listener),
};
```

Here, `bridge` is application-owned and must preserve message order, the exported `MessagePortMessage` union, and `Uint8Array` values. If the host only transports strings, use `desktopEndpoint()` instead of inventing another serialization format.

The desktop helpers are exported from `/electron`, `/desktop`, `/tauri`, and `/dioxus`; their host-specific setup and lifetime rules are covered in [desktop bridges](./desktop-bridges.md).

## Understand readiness, channels, and ownership

`server.ready` and `transport.ready` resolve after the local endpoint listener has been installed. They are not a handshake with the peer. Client calls wait for the transport listener automatically; awaiting both promises is useful when either endpoint subscribes asynchronously.

One port can carry concurrent calls because every request has a correlation ID. It can also carry independent APIs when each pair uses a different channel:

```ts
const server = messagePortAdapter(serverPort, {
  channel: "admin-api",
}).mount(implementation);

const transport = messagePortTransport(clientPort, {
  channel: "admin-api",
});
```

The default channel is `@hulla/api`, and the current protocol version is `1`. A custom channel must be non-empty and match exactly. Messages for another channel or protocol version are ignored. A channel separates traffic; it does not authenticate the sender or authorize a call.

The application owns port transfer, access policy, host shutdown, and native port closure. `transport.close()` rejects local calls, sends best-effort cancellation messages, and removes its listener; it does not send a close notification to the server. `server.close()` sends that notification, cancels active handlers and streams cooperatively, and removes its listener. Neither method closes the supplied port.

## Cancel work and consume streams

Pass an `AbortSignal` through the generated client call:

```ts
const controller = new AbortController();
const pending = client.health({ signal: controller.signal });

controller.abort(new Error("No longer needed"));
await pending; // rejects with the abort reason
```

An abort during asynchronous endpoint setup rejects without sending the request. After a request has been sent, the transport sends a cancellation message. The server aborts the request signal and closes an active stream iterator when possible. Handler code must still cooperate with that signal; cancellation cannot forcibly stop arbitrary work.

Response streams are pull-driven. Every client iterator read asks the producer for one `Uint8Array` chunk, so a slow consumer does not make the transport buffer the whole stream. Returning from the generated stream iterator early or aborting the call cancels the remote producer.

## Know what crosses the boundary

Requests support JSON, text, bytes, and form data. Responses additionally support empty values, raw values, and streams. `response.raw()` is transport-native: over this transport the generated client receives the native message-port response envelope. Use an explicit representation or codec when the caller needs a portable body value.

Form data is encoded as ordered string and file entries rather than relying on native `FormData` structured cloning; file bytes, name, media type, and modification time are retained.

Native ports use their host's structured-clone rules. A custom endpoint must serialize the same values itself. In particular, a raw response value must be supported by that endpoint's serialization.

Declared route statuses, including declared `4xx` and `5xx` results, resolve normally. Protocol and session failures reject with `MessagePortTransportError`:

| Code              | Meaning                                                             |
| ----------------- | ------------------------------------------------------------------- |
| `closed`          | The local transport or remote server session closed                 |
| `invalid-message` | A response or stream message did not match the protocol             |
| `remote-error`    | The server reported a routing, decoding, handler, or stream failure |

Endpoint setup and local send failures may instead reject with the endpoint's own error.

Use the adapter's `onError` mount option when the server must log or replace its default protocol-safe failure response. The transport does not add authentication, retries, reconnection, replay, caching, or deduplication.

## Use transport-specific server context only when needed

Bind context to the adapter when a server needs the original port, request envelope, normalized endpoint, or cancellation signal. Continuing with the same `contract` and server-side port:

```ts
const adapter = messagePortAdapter(serverPort);

const contextualImplementation = defineServer(contract, {
  context: adapter.context(({ port, request }) => ({
    port,
    signal: request.signal,
  })),
}).implement({
  health: ({ context }) => ({
    status: 200,
    body: context.port === serverPort ? "ok" : "unexpected port",
  }),
});

const server = adapter.mount(contextualImplementation);
```

Keep the server portable when it does not need those values. An implementation with context bound to another native adapter cannot be mounted here.

## Next steps

Read [desktop bridges](./desktop-bridges.md) for Electron handoff, Tauri channels, Dioxus eval, and string relays. Use [WebSocket](./websocket.md) when the boundary is a long-lived network connection rather than local IPC.
