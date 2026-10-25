# Server and browser calls

A browser needs to send a request to call your API. Server code can call the implementation directly when it's already running in the same process.

Both clients use the same [contract](./contract-authoring.md). Here's how to set up each one to load a user.

## Call from the browser

Create a client with [`fetchTransport()`](https://hulla.dev/docs/api/transports/fetch). It sends requests to the paths in your contract:

```ts filename="src/api/browser-client.ts"
import { createClient } from '@hulla/api/client'
import { fetchTransport } from '@hulla/api/fetch'
import { contract } from './contract'

export const api = createClient(contract, {
  transport: fetchTransport(),
})
```

Import this client into your UI and call the route:

```ts
import { api } from './api/browser-client'

const result = await api.users.byId({ params: { id: 'ada' } })
if (result.status === 200) console.log(result.body.name) // Ada
```

The server must expose the contract at an HTTP endpoint. The [framework pages](#connect-your-framework) below show where to mount it. For an API on another origin, set `baseUrl` to that origin.

## Call directly from server code

Use [`inProcessTransport()`](https://hulla.dev/docs/api/transports/in-process) when your server code can import the implementation. It calls the handler without making an HTTP request back to your own server.

```ts filename="src/api/server-client.ts"
import { createClient } from '@hulla/api/client'
import { inProcessTransport } from '@hulla/api/in-process'
import { contract } from './contract'
import { implementation } from './server'

export const api = createClient(contract, {
  transport: inProcessTransport(implementation),
})
```

This example uses `src/api/server.ts` from [Server implementations](./server-authoring.md). Import the local client into a server-rendered page or a background job and make the same `api.users.byId(...)` call.

Validation and server middleware still run. HTTP route matching and endpoint middleware don't, because this call never reaches the HTTP endpoint.

> [!WARNING] Keep the local client on the server
> A filename alone doesn't prevent browser imports. Use your framework's server-only guard or directory convention. Avoid re-exporting this client from a shared module that UI code imports.

## When server code still needs HTTP

Use Fetch when the API runs in another process or deployment. Use it when you need the endpoint's HTTP middleware or response headers, too.

In Node.js and other server runtimes, provide an absolute URL:

```ts
const api = createClient(contract, {
  transport: fetchTransport({ baseUrl: 'https://api.example.com' }),
})
```

Some frameworks supply a request-aware `fetch` that can resolve relative URLs. Follow the framework's integration page when using that API.

> [!IMPORTANT] Server requests need their own credentials
> A server-side Fetch call doesn't automatically inherit the browser's cookies or authorization headers. Forward the credentials the call needs, or use a framework API that explicitly handles forwarding. A local call also needs the caller's identity supplied through context; it doesn't inherit a session by running on the server.

## Call inside a framework server function

A framework server function can use the local client inside its callback. The framework handles the browser-to-server request; the local client then runs your API implementation in that callback.

Use this for operations within your app. Keep an HTTP endpoint when mobile apps, other services, or generated clients need to call the API independently.

> [!NOTE] Check context before using a local client
> An implementation created with a host-specific context factory, such as `nextAdapter().context()`, requires that adapter. `inProcessTransport()` rejects it during setup. Use portable context or a framework-specific local transport that supplies the required context.

## Connect your framework

| Framework | Start here |
| --- | --- |
| [Next.js](./next.md) | App Router Route Handlers; [caching and invalidation](./next-data.md) |
| [TanStack Start](./tanstack-start.md) | Server routes and server functions |
| [React Router](./react-router.md) | Resource routes, loaders, and actions |
| [SolidStart](./solid-start.md) | API routes, queries, and actions |
| [SvelteKit](./sveltekit.md) | Endpoints and `load`; [remote functions](./sveltekit-remote-functions.md) |
| [Nuxt](./nuxt.md) | Nitro routes and `useAsyncData` |
| [Astro](./astro.md) | Endpoints, components, and server islands |

For response handling and client middleware, continue to [Calling the API](./client-authoring.md).
