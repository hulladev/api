# Hybrid rendering and safe transport setup

Choose the execution boundary once in application setup. Server-only code can call a colocated implementation through a local transport; browser code reaches the backend through Fetch or a framework server function. Dynamic server rendering can execute locally just like build-time rendering. A separately deployed backend still requires a network transport, even when its caller runs on a server.

Keep the framework in charge of rendering, hydration, caching, authentication, redirects and invalidation. The package owns contract processing and implementation middleware. A local call does not execute the HTTP endpoint's middleware or automatically copy its cookies and response headers onto the page response.

## Recommended setups

The linked fixtures are small applications built by the integration tests against workspace package exports. Copy the relevant modules into an application and replace their fixture services. They are reference setups, not standalone generated projects: some inherit workspace configuration and dependencies. The Next `probe` module and route are test instrumentation and should not be copied.

| Framework | Recommended application entry point | Working fixture |
|---|---|---|
| Next.js | Server-only local client for Server Components/actions; separate Fetch client for Client Components | [Local client](../packages/next/tests/fixtures/next-app/local-client.ts), [browser client](../packages/next/tests/fixtures/next-app/browser-client.ts), [static page](../packages/next/tests/fixtures/next-app/app/page.tsx), [request-rendered page](../packages/next/tests/fixtures/next-app/app/account/page.tsx) |
| Astro | `astroInProcessTransport(implementation, Astro)` in server components and deferred server islands; Fetch in browser islands | [Server island](../packages/astro/tests/fixtures/astro-app/src/components/Status.astro) |
| SvelteKit | Local client under `$lib/server` for portable server loaders; `svelteKitRemoteTransport` inside remote callbacks; framework-supplied Fetch in universal loaders | [Local client](../packages/sveltekit/tests/fixtures/sveltekit-app/src/lib/server/client.ts), [server loader](../packages/sveltekit/tests/fixtures/sveltekit-app/src/routes/+page.server.ts), [remote functions](../packages/sveltekit/tests/fixtures/sveltekit-app/src/routes/health.remote.ts) |
| Nuxt | `useApi()` captures `event.fetch` on the server and `$fetch.raw` in the browser in the current setup context; `useAsyncData` owns page reads and hydration | [Composable](../packages/nuxt/tests/fixtures/nuxt-app/app/composables/useApi.ts), [page and mutation](../packages/nuxt/tests/fixtures/nuxt-app/app/app.vue) |
| TanStack Start | Isomorphic loader calls a server function; its handler imports the local client | [Server function](../packages/tanstack-start/tests/fixtures/start-app/src/api/health.functions.ts), [loader](../packages/tanstack-start/tests/fixtures/start-app/src/routes/index.tsx) |
| React Router framework mode | Server `loader`/`action` imports a `.server` client; client loaders/actions use Fetch or delegate to the server | [Local client](../packages/react-router/tests/fixtures/react-router-app/app/api/client.server.ts), [loader](../packages/react-router/tests/fixtures/react-router-app/app/routes/home.tsx) |
| SolidStart | A `query` calls a function with `use server`; that function imports the local client | [Server query](../packages/solid-start/tests/fixtures/solid-start-app/src/api/health.ts), [consumer](../packages/solid-start/tests/fixtures/solid-start-app/src/routes/index.tsx) |

Nuxt's request-aware fetcher and SvelteKit's supplied `fetch` can dispatch local endpoint requests internally. Keep those framework paths when request forwarding or universal execution is useful. A Fetch-shaped interface does not necessarily imply a network hop.

## Next.js: two clients, enforced server imports

Put the local client, implementation, and database access behind Next's server-only marker:

```ts
// api/server.ts
import 'server-only'
import { createClient } from '@hulla/api/client'
import { inProcessTransport } from '@hulla/api/in-process'
import { contract } from './contract'
import { implementation } from './implementation'

export const api = createClient(contract, {
  transport: inProcessTransport(implementation),
})
```

Also put `import 'server-only'` in `implementation.ts`; protecting just the client leaves a direct implementation import unguarded. Install the marker package if required by the application's dependency tooling. Next recognizes it during compilation.

```ts
// api/browser.ts
import { createClient } from '@hulla/api/client'
import { fetchTransport } from '@hulla/api/fetch'
import { contract } from './contract'

export const api = createClient(contract, { transport: fetchTransport() })
```

Server Components import `api/server`; Client Components import `api/browser`. Both call the same contract-shaped methods. The Next fixture builds an interactive browser consumer and executes its browser-safe client module against the real HTTP endpoint. Deliberately importing either the local client or implementation from a Client Component fails the production build.

A request-time page must establish its rendering mode outside the API error boundary. The fixture uses `export const dynamic = 'force-dynamic'` on the account page. With Cache Components or another rendering configuration, use that configuration's supported request-time boundary. Reading `cookies()` for the first time deep inside a contract handler during prerendering can throw framework control-flow exceptions that the API converts into a problem response. Likewise perform framework redirects and not-found handling after narrowing the API result, outside the handler.

Plain context factories can use lazy, request-scoped services so public routes remain usable during prerendering. Never cache a resolved user in a module singleton. An implementation explicitly bound to `nextAdapter().context()` still cannot mount through generic in-process transport; do not cast away that restriction or synthesize a `NextRequest` to evade it.

## SvelteKit: server modules and native remote functions

Place the implementation and local client under `$lib/server`. A `+page.server.ts` loader can import that client; a component or universal `+page.ts` loader cannot. The negative production fixture verifies this restriction.

Use the existing remote integration when a server implementation needs SvelteKit's current request event:

```ts
// routes/products.remote.ts
import { query } from '$app/server'
import { svelteKitRemoteTransport } from '@hulla/api-sveltekit/remote'
import { createClient } from '@hulla/api/client'
import { contract } from '$lib/api/contract'
import { implementation } from '$lib/server/implementation'

const api = createClient(contract, {
  transport: svelteKitRemoteTransport(implementation),
})

export const products = query(async () => {
  const result = await api.products.list()
  if (result.status !== 200) throw new Error(`Could not load products: ${result.status}`)
  return result.body
})
```

This example assumes a `products.list` route in the application's contract. SvelteKit owns the generated endpoint and client protocol. The local transport supplies the current event at invocation time, rather than capturing one request when the module loads. Remote functions retain their framework version/configuration requirements; see the [SvelteKit guide](./sveltekit.md).

## Start and SolidStart: let the compiler own the boundary

Keep the framework-recognized declaration in application source. For Start, a `createServerFn(...).handler(...)` imports the local client inside its handler. For SolidStart, the query's server function contains the `use server` directive and imports the local client there. The fixture links above show the complete authoring pattern.

The framework compiler separates these functions into server implementations and browser references. A dynamic import by itself is not a server boundary. Do not move the implementation import into a shared barrel or assume `typeof window` protects it.

Return the body or a small serializable result from these functions. Framework RPC has its own input validation, error, streaming and serialization rules; it does not automatically support every raw or streaming contract response. Use the HTTP endpoint for consumers that need the HTTP contract itself.

## What the safeguards establish

The test suite verifies:

- Next and SvelteKit production builds reject deliberate imports across server/browser boundaries.
- Private implementation markers are present in server JavaScript and absent from browser JavaScript in Next, SvelteKit, Start and SolidStart builds.
- Next prerenders a local read without a running API endpoint; concurrent request-rendered pages keep distinct session identities and do not invoke that endpoint. The browser-safe client does invoke it.
- Astro server islands preserve their native island request context across concurrent fixture sessions.
- Nuxt SSR retains request-specific session values through its request-aware client.
- SvelteKit and React Router render pages through local server loaders, and Start/SolidStart render through server functions, while retaining their HTTP endpoints.

The shared-helper production build subprocesses explicitly clear Vitest's `TEST` and `VITEST` environment flags: SvelteKit disables its server-import guard under `TEST=true`. The tests use actual compiler diagnostics, not merely the presence of marker imports. The fixture sessions are test data, not an authentication implementation. These tests do not claim browser-click coverage or measure production throughput.

The Nuxt implementation lives outside Nitro's auto-imported `server/utils` directory to avoid initialization cycles. The Nuxt setup also keeps core external during Vite SSR bundling so Nitro resolves a single copy of contract state; see the [Nuxt configuration](./nuxt.md#create-a-request-aware-client).

Generic in-process execution remains available in any JavaScript environment, including legitimate browser-local implementations. Core does not infer deployment topology, ban server-side Fetch, or select a transport based on `window`. These setups add no runtime dependencies or per-call checks to core. The Nuxt transport selects its raw/native response reader once during setup and rejects parsed-only fetchers early. A single-import compiler plugin and scaffolding CLI remain deferred.
