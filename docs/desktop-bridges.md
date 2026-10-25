# Desktop bridges

Call your API across an Electron, Tauri, or Dioxus bridge with the desktop entrypoints in `@hulla/api-message-port`. Your app connects the native message relay; the package matches each response to its client call.

The examples build on the `health` contract from [MessagePort](./message-port.md).

## Install the package

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

> [!WARNING]
> **The native relay is application code**
>
> These helpers do not provide Tauri commands, Rust routing, Electron port handoff, Dioxus eval ownership, authentication, or capabilities. They adapt a boundary that your application creates and secures.

## Choose a helper

| Helper               | Use it when                                                      | Boundary supplied by the application                        |
| -------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------- |
| `electronEndpoint()` | An Electron main process transfers a `MessagePort` to a renderer | `MessageChannelMain`, preload handoff, and window lifetime  |
| `tauriEndpoint()`    | A Tauri frontend uses a native `Channel<string>` plus commands   | Command registration, channel routing, and capability scope |
| `dioxusEndpoint()`   | Code inside `document.eval` uses Dioxus `send()` and `recv()`    | Eval creation, relay loop, and eval lifetime                |
| `desktopEndpoint()`  | Another host exposes an ordered string relay                     | Ordered `send`, async `subscribe`, and shutdown signaling   |

Use the base MessagePort APIs directly when both sides exchange structured `MessagePortMessage` values and `Uint8Array`. Use a desktop helper when the host boundary carries strings.

## Electron: transfer a dedicated port

`electronEndpoint()` normalizes Electron's main-process and renderer port shapes. It does not create or transfer the port.

In the main process, create the channel, mount the implementation, and transfer the renderer end with an application-defined event name:

```ts filename="src/main/api-port.ts"
import { MessageChannelMain } from "electron";
import { messagePortAdapter } from "@hulla/api-message-port";
import { electronEndpoint } from "@hulla/api-message-port/electron";

const { port1: mainPort, port2: rendererPort } = new MessageChannelMain();

const server = messagePortAdapter(electronEndpoint(mainPort)).mount(
  implementation,
);

await server.ready;

mainWindow.webContents.postMessage("hulla-api-port", null, [rendererPort]);
```

The first argument to `webContents.postMessage()` is a string event name, not the `MessageChannelMain` object. The transferred `MessagePortMain` becomes a DOM `MessagePort` in the renderer.

Once the preload layer has received and exposed that port, the renderer can create the client:

```ts filename="src/renderer/api-client.ts"
import { createClient } from "@hulla/api/client";
import { messagePortTransport } from "@hulla/api-message-port";
import { electronEndpoint } from "@hulla/api-message-port/electron";

const transport = messagePortTransport(electronEndpoint(rendererPort));

await transport.ready;

const client = createClient(contract, { transport });
const result = await client.health();

console.log(result.body); // "ok"
```

Transfer ports with Electron's `postMessage` path; ordinary `send` and `invoke` calls do not transfer them. The preload handoff, context-isolation policy, reload behavior, and trusted window selection remain application concerns.

Close the transport and server sessions before closing their ports. Session cleanup removes `@hulla/api-message-port` listeners and settles active work, but it does not close a port or observe window destruction automatically.

```ts
// Renderer shutdown
await transport.close();
rendererPort.close();

// Main-process shutdown
await server.close();
mainPort.close();
```

## Tauri: define the native command contract

`tauriEndpoint()` connects a Tauri `Channel<string>` to three application-defined operations:

```ts filename="src/api/tauri-client.ts"
import { Channel, invoke } from "@tauri-apps/api/core";
import { createClient } from "@hulla/api/client";
import { messagePortTransport } from "@hulla/api-message-port";
import { tauriEndpoint } from "@hulla/api-message-port/tauri";

const lifetime = new AbortController();
const messages = new Channel<string>();
const sessionId = crypto.randomUUID();

const endpoint = tauriEndpoint({
  signal: lifetime.signal,
  messages,
  connect: () => invoke("api_connect", { sessionId, messages }),
  send: (message) => invoke("api_send", { sessionId, message }),
  disconnect: () => invoke("api_disconnect", { sessionId }),
});

const transport = messagePortTransport(endpoint);

try {
  await transport.ready;

  const client = createClient(contract, { transport });
  const result = await client.health();

  console.log(result.body); // "ok"
} finally {
  await transport.close();
  lifetime.abort();
}
```

Treat those commands as an interface your native application must implement:

| Command          | Required behavior                                                                     |
| ---------------- | ------------------------------------------------------------------------------------- |
| `api_connect`    | Register this session's `Channel<String>` and resolve only when peer routing is ready |
| `api_send`       | Forward one opaque encoded string to the session's peer in order                      |
| `api_disconnect` | Remove the session route and release its native resources                             |

Register the commands with the Tauri builder and capability configuration. Scope every route to the invoking window or session; do not share one unqualified global channel across unrelated windows.

The endpoint installs its channel listener before calling `connect()`, so `transport.ready` does not resolve until registration completes. Use one `Channel<string>` per endpoint. Abort `lifetime` when the native connection or window closes, and call `transport.close()` during normal cleanup.

If the peer is another JavaScript context that owns the TypeScript implementation, wrap its relay in another endpoint and mount it with `messagePortAdapter(peerEndpoint).mount(implementation)`.

## Dioxus: bind one API session to one eval

`dioxusEndpoint()` adapts the `dioxus` object injected into code run by `document.eval`. The following is eval-scoped source, not an ordinary application module: bundle or inline it as the body passed to `document.eval`.

```ts filename="src/api/dioxus-eval-script.ts"
import { createClient } from "@hulla/api/client";
import { messagePortTransport } from "@hulla/api-message-port";
import { dioxusEndpoint } from "@hulla/api-message-port/dioxus";

const lifetime = new AbortController();
const endpoint = dioxusEndpoint(dioxus, {
  signal: lifetime.signal,
});

const transport = messagePortTransport(endpoint);

try {
  await transport.ready;

  const client = createClient(contract, { transport });
  const result = await client.health();

  console.log(result.body); // "ok"
} finally {
  await transport.close();
  lifetime.abort();
}
```

The native owner must keep the eval returned by `document.eval` and relay its opaque strings:

- receive JavaScript-to-native strings from the eval;
- deliver peer strings back to the eval;
- drop the eval when the session closes so an outstanding native receive can finish.

The JavaScript helper owns one receive loop and closes the API session when `recv()` fails. During normal cleanup, close the transport, abort `lifetime`, and release the native eval. JavaScript cannot cancel a native receive that is already waiting; the native owner must release it.

A Rust implementation cannot mount a TypeScript `defineServer()` value. It must either relay the protocol to a JavaScript implementation or implement the exported protocol itself.

## Adapt another ordered string relay

Use `desktopEndpoint()` when the host provides ordered `send` and `subscribe` operations but no native `MessagePort`. This example makes the application-owned boundary explicit:

```ts
import { createClient } from "@hulla/api/client";
import {
  messagePortAdapter,
  messagePortTransport,
} from "@hulla/api-message-port";
import {
  desktopEndpoint,
  type DesktopBridge,
} from "@hulla/api-message-port/desktop";

declare const serverBridge: DesktopBridge;
declare const clientBridge: DesktopBridge;

const lifetime = new AbortController();
const serverEndpoint = desktopEndpoint(serverBridge, {
  signal: lifetime.signal,
  channel: "desktop-api",
});
const clientEndpoint = desktopEndpoint(clientBridge, {
  signal: lifetime.signal,
  channel: "desktop-api",
});

const server = messagePortAdapter(serverEndpoint, {
  channel: "desktop-api",
}).mount(implementation);
const transport = messagePortTransport(clientEndpoint, {
  channel: "desktop-api",
});

try {
  await Promise.all([server.ready, transport.ready]);

  const client = createClient(contract, { transport });
  const result = await client.health();

  console.log(result.body); // "ok"
} finally {
  await transport.close();
  await server.close();
  lifetime.abort();
}
```

Each bridge forwards one encoded string unchanged and returns a cleanup function from `subscribe()`. It must preserve ordering. If a custom channel is used, pass the same value to both desktop endpoints, the adapter, and the transport.

## Preserve encoding and lifecycle rules

The desktop encoding supports JSON-compatible primitives, arrays, plain records, `undefined`, `Uint8Array`, and `FormData` fields and files. It rejects cycles and host-native objects such as `Date` or `Response`; use a contract codec before those values cross the boundary.

The native relay should forward encoded strings unchanged rather than parsing and serializing them again. Malformed input closes the endpoint and releases its listener.

Each desktop endpoint supports one active session and is not reusable after closure. The helpers do not retry, reconnect, or replay calls. Abort the supplied lifetime signal when the window, native channel, eval, or process shuts down so pending work does not wait indefinitely.

Host references:

- [Electron MessagePorts](https://www.electronjs.org/docs/latest/tutorial/message-ports)
- [Tauri commands and channels](https://v2.tauri.app/develop/calling-rust/)
- [Dioxus eval](https://dioxuslabs.com/learn/0.7/essentials/ui/escape/)
