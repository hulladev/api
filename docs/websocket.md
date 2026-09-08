# WebSocket

Install `@hulla/api-websocket` alongside `@hulla/api`. The package has no WebSocket implementation dependency: the
application supplies a browser WebSocket or a compatible accepted server socket (tested with `ws`). Core stays independent.

```ts
import { defineClient } from '@hulla/api/client'
import { webSocketAdapter, webSocketTransport } from '@hulla/api-websocket'

// Server: call this for each accepted socket.
const server = webSocketAdapter(acceptedSocket).mount(implementation)

// Client: a connecting socket is supported; calls wait until it opens.
const transport = webSocketTransport(new WebSocket('wss://example.com/api'))
const client = defineClient(contract, { transport })
await transport.ready
```

Use one API session per dedicated socket. The application owns upgrade routing, authentication, origin checks, socket
creation and socket shutdown. `transport.close()` and `server.close()` close the API session and release listeners;
they do not close the supplied socket. `ready` rejects if opening fails; `closed` resolves with the terminal error.
A closed session is not reused. Reconnection, retries and deadlines are application policy; requests are never replayed.

Concurrent calls use correlated request IDs. The versioned wire protocol carries JSON, text, bytes, empty values and
FormData fields/files. Bytes use base64 inside tagged JSON envelopes; native objects require application codecs.
Raw native Response objects are unsupported. Status and headers are contract metadata here, not HTTP headers or cookies
applied by the browser. Both peers must use this package's protocol; this is not a generic WebSocket message client.

Response streams are pull-driven: each iterator read requests another chunk. Aborting a call, returning its iterator,
closing the API session or disconnecting cancels the server request and releases its producer. Producers should observe
the request signal, especially while awaiting work. Disconnects and late producer failures reject outstanding reads.

`webSocketAdapter(socket).context(...)` exposes the socket and encoded request with its cancellation signal. Normal core
validation and middleware apply. `onError` observes adapter failures using the same pattern as other server adapters.
No extra body, message, timeout or concurrency defaults are imposed; socket implementation limits still apply.

Real-socket tests cover shared conformance, native browser-compatible clients, concurrent calls, fragment mounting,
malformed messages, wire representations, cancellation, disconnects, backpressure and listener cleanup. Packed consumers
and browser bundle boundaries verify the optional package boundary.
