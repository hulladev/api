# Message-port transport

`@hulla/api/message-port` carries the transport-neutral client invocation over an ordered, bidirectional message
channel. It works directly with browser and worker `MessagePort`, Node.js `worker_threads.MessagePort`, and Electron's
EventEmitter-style `MessagePortMain`. A small async endpoint interface supports other IPC bridges without making the core
package depend on a desktop runtime.

## MessagePort setup

Give one end of a channel to the server and the other to the client:

```ts
import { defineClient } from '@hulla/api/client'
import { messagePortAdapter, messagePortTransport } from '@hulla/api/message-port'

const server = messagePortAdapter(serverPort).mount(implementation)
const transport = messagePortTransport(clientPort)

await Promise.all([server.ready, transport.ready])

const client = defineClient(contract, { transport }).create()
const result = await client.users.byId({ params: { id: 'user-1' } })
```

`serverPort` and `clientPort` may be DOM, Web Worker, Node worker-thread, or Electron ports. The adapter detects
`addEventListener`/`removeEventListener` and `on`/`off` listener styles and calls `start()` when the host exposes it.
Electron can therefore use the renderer's transferred DOM port on one side and `MessagePortMain` on the other without an
Electron-specific package.

Calls are correlated by generated IDs, so one port supports concurrent requests whose responses finish in any order. A
custom `channel` separates independent APIs sharing a port:

```ts
const server = messagePortAdapter(serverPort, { channel: 'admin-api' }).mount(implementation)
const transport = messagePortTransport(clientPort, { channel: 'admin-api' })
```

The client forwards aborts as cancellation messages. A message-port-bound context factory can observe cooperative server
cancellation and access the normalized endpoint, original port or endpoint, and request envelope:

```ts
const adapter = messagePortAdapter(serverPort)

const server = defineServer(contract, {
  context: adapter.context(({ endpoint, message, port, request }) => ({
    signal: request.signal,
  })),
})
```

Keep the context factory portable when it does not need these values. An implementation bound to a different native
adapter is rejected when mounted.

## Representations and streams

JSON, text, and byte bodies cross as their encoded wire values. Form data is converted to ordered string/file entries so
it does not depend on native `FormData` structured-clone support; files retain their bytes, name, media type, and modified
time. Raw response values must themselves be supported by the endpoint's serialization.

Response streams use pull messages. The server reads one `Uint8Array` chunk for each pending client `next()` call, so a
slow consumer does not cause the transport to eagerly buffer the complete producer. Returning early from iteration or
aborting the request closes the remote iterator. Stream cancellation remains cooperative for handler work that has
already started.

Call `transport.close()` and `server.close()` when their owners shut down. These methods remove listeners and settle
active work but deliberately do not close the supplied port, because the application owns that port and may share it.

## Tauri, Dioxus, and custom IPC

Tauri channels and Dioxus eval messaging are not JavaScript `MessagePort` objects: their other endpoint is Rust and their
serialization and lifecycle are host-defined. Use the exported `MessageEndpoint` interface when an application provides
an ordered, bidirectional bridge:

```ts
import type { MessageEndpoint } from '@hulla/api/message-port'

const endpoint: MessageEndpoint = {
  send: (message) => desktopIpc.send(message),
  subscribe: async (listener) => desktopIpc.listen(listener),
}
```

`subscribe` may be asynchronous; `ready` prevents the first call from racing listener installation. The bridge must
preserve the message union and `Uint8Array` values, or explicitly encode and restore binary values. The protocol message
types and `MESSAGE_PORT_PROTOCOL_VERSION` are exported for a native implementation.

This endpoint hook is enough for JavaScript-to-JavaScript routing through a Tauri or Dioxus host. A Rust service cannot
mount a TypeScript `defineServer()` implementation; it must implement the exported protocol on the native side or expose
an application-specific command transport instead. Port or IPC possession is also not authentication—desktop apps must
apply their own capability and origin policy when distributing endpoints.

