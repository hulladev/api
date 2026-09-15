# Desktop bridges

The optional `@hulla/api-message-port` package provides `/electron`, `/tauri`, `/dioxus` and `/desktop` entrypoints.
Core does not depend on any desktop runtime. These helpers connect two JavaScript API endpoints through native IPC;
a Rust backend must separately implement the API protocol or relay messages to a JavaScript implementation.

## Electron

```ts
import { electronEndpoint } from '@hulla/api-message-port/electron'
import { messagePortAdapter, messagePortTransport } from '@hulla/api-message-port'

// Main process: the caller supplies one MessageChannelMain port.
const server = messagePortAdapter(electronEndpoint(mainPort)).mount(implementation)
// Renderer: the caller supplies the other transferred DOM MessagePort.
const transport = messagePortTransport(electronEndpoint(rendererPort))
```

Create the channel with Electron's `MessageChannelMain` and transfer the renderer port using
`webContents.postMessage(channel, null, [port])`. Receive it through the application's preload/renderer handoff.
The bridge uses dedicated ports rather than exposing general `ipcRenderer` access. The application owns trusted port
handoff, reload/window lifecycle and port closure. Close transport/server sessions before closing their ports; this
helper retains existing MessagePort semantics and does not automatically observe Electron window destruction.

## Tauri

```ts
import { Channel, invoke } from '@tauri-apps/api/core'
import { tauriEndpoint } from '@hulla/api-message-port/tauri'
import { messagePortTransport } from '@hulla/api-message-port'

const lifetime = new AbortController()
const messages = new Channel<string>()
const endpoint = tauriEndpoint({
  signal: lifetime.signal,
  messages,
  connect: () => invoke('api_connect', { messages }),
  send: (message) => invoke('api_send', { message }),
  disconnect: async () => { await invoke('api_disconnect') },
})
const transport = messagePortTransport(endpoint)
await transport.ready
```

The three command names above are application-defined, not provided by Tauri or this package. Implement a native relay:
`api_connect` stores this window's `Channel<String>` and resolves once its peer route is ready; `api_send` forwards the
opaque string to that peer in order; `api_disconnect` unregisters it. The peer uses the same desktop JSON encoding.
Keep routing scoped to the invoking window/session. Native command registration, capabilities and peer selection belong
to the application. This package supplies the JavaScript bridge, not a Rust relay implementation.

The listener is installed before `connect` starts. First client calls wait for registration; registration failures and
shutdown during registration release the native subscription. Use a dedicated Channel per endpoint. Abort `lifetime`
when the native connection fails or its window closes, and call `transport.close()` during normal cleanup. To host a
TypeScript server on the other JavaScript side, pass its endpoint to `messagePortAdapter(endpoint).mount(implementation)`.

## Dioxus

```ts
import { dioxusEndpoint } from '@hulla/api-message-port/dioxus'
import { messagePortTransport } from '@hulla/api-message-port'

// Run inside document.eval's script, where Dioxus injects `dioxus`.
const lifetime = new AbortController()
const transport = messagePortTransport(dioxusEndpoint(dioxus, { signal: lifetime.signal }))
```

Use one eval channel per API session. Its Rust owner forwards strings received through `eval.recv()` to the peer, and
returns peer strings through `eval.send()`. The JavaScript helper serializes messages, owns one receive loop, and closes
the API session when `recv()` fails. On cleanup, close the transport, abort the lifetime and drop the native eval.
JavaScript cannot cancel an outstanding native `recv()`; the native owner must release it. No core changes or Rust
contract execution are introduced. The injected `dioxus` object is scoped to eval, not an arbitrary global browser API.

## JSON protocol and ownership

`desktopEndpoint({ send, subscribe }, { signal })` adapts another ordered string relay. `subscribe` returns an unsubscribe
function and may be asynchronous. Endpoints support one session and are not reusable after closure. Sends are serialized.
All helpers retain the MessagePort request IDs, cancellation and pull-driven streaming protocol. Custom protocol channels
must match the `channel` option on both the desktop endpoint and MessagePort transport/adapter.

`encodeDesktopMessage` and `decodeDesktopMessage` from `/desktop` handle tagged JSON containers, bytes, multipart,
undefined and user keys without tag collisions. Native objects require contract codecs. A relay should forward these
strings unchanged. Malformed encoding closes the session and releases its listener. The native owner must abort the
provided signal on host failure so pending work does not wait forever. No retries, reconnect or replay are automatic.

Tests run the shared conformance suite through a string relay, including multipart/file bytes, cancellation and stream
cleanup, and simulate Tauri registration and Dioxus eval lifecycle. These are JavaScript boundary tests; they do not
certify packaged Electron/Tauri/Dioxus applications. Run `bun x vitest run packages/message-port/tests/desktop.test.ts`
and `bun run check:packages --package=message-port` after building.

Host references: [Electron MessagePorts](https://www.electronjs.org/docs/latest/tutorial/message-ports),
[Tauri commands and channels](https://v2.tauri.app/develop/calling-rust/),
[Dioxus eval](https://dioxuslabs.com/learn/0.7/essentials/ui/escape/).
