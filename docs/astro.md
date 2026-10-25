# Astro

Serve your API from an Astro endpoint, then call it from the browser or an Astro component. The example adds a route at `/api` and checks it with an HTTP request.

This is useful when other apps also need your API. For a form or operation used only by your Astro site, [Astro Actions](https://docs.astro.build/en/guides/actions/) may be all you need.

## Install the integration

This guide assumes an Astro application with Node.js 22 or newer. `@hulla/api-astro` supports Astro
5, 6, and 7.

> `@hulla/api-astro` does not deploy an Astro application. An on-demand endpoint or deferred server
> island also needs an Astro deployment adapter such as `@astrojs/node`, `@astrojs/cloudflare`, or
> the adapter for your host.

<!-- docs:package-manager -->

```sh
# Bun
bun add @hulla/api-astro @hulla/api zod

# npm
npm install @hulla/api-astro @hulla/api zod

# pnpm
pnpm add @hulla/api-astro @hulla/api zod

# Yarn
yarn add @hulla/api-astro @hulla/api zod
```

## Define and mount one endpoint

Keep the contract in a shared module and the implementation in a server-only module. This example
uses one `users.byId` route throughout the page.

```ts
// src/api/contract.ts
import { defineContract, response, route, router } from "@hulla/api";
import { z } from "zod";

const user = z.object({ id: z.string(), name: z.string() });

export const contract = defineContract({
  basePath: "/api",
  routes: {
    users: router("/users", {
      routes: {
        byId: route.get("/:id", {
          params: z.object({ id: z.string() }),
          responses: {
            200: response.json(user),
            404: response.json(z.object({ message: z.string() })),
          },
        }),
      },
    }),
  },
});
```

```ts
// src/api/server.ts — server-only code
import { defineServer } from "@hulla/api/server";
import { contract } from "./contract";

const users = new Map([["ada", "Ada Lovelace"]]);

export const implementation = defineServer(contract).implement({
  users: {
    byId: ({ params, response }) => {
      const name = users.get(params.id);
      return name === undefined
        ? response(404, { message: "User not found" })
        : response(200, { id: params.id, name });
    },
  },
});
```

Mount that implementation from an Astro rest-parameter endpoint:

```ts
// src/pages/api/[...api].ts
import { astroAdapter } from "@hulla/api-astro";
import { implementation } from "../../api/server";

export const prerender = false;
export const ALL = astroAdapter().mount(implementation);
```

The contract's `basePath` (`/api`) must align with the Astro file route
(`src/pages/api/[...api].ts`). The rest parameter covers nested paths and, in on-demand routing,
can also match the top-level `/api` path with an undefined rest parameter; a separate
`src/pages/api.ts` re-export is not required. With `output: 'static'`, `prerender = false` opts the
endpoint into on-demand rendering. With `output: 'server'`, it is on-demand by default. Both modes
require a deployment adapter.

Start the app and verify the mounted HTTP boundary:

```sh
curl -i http://localhost:4321/api/users/ada
```

```http
HTTP/1.1 200 OK
content-type: application/json

{"id":"ada","name":"Ada Lovelace"}
```

`ALL` exposes every method declared by the mounted contract, including the custom `QUERY` method.
For a contract `GET` operation, Astro `HEAD` dispatches through that `GET` operation and returns its
status and headers without a body. The adapter's dispatch request is `GET`, while the native
`astroContext.request` remains `HEAD`. An unmatched path returns `404`; a known path with an
unsupported method returns `405` with an `Allow` header.

## Choose the caller boundary

| Caller                                                                  | Use                                              | What happens                                                                    |
| ----------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------- |
| Browser, mobile client, or another service                              | `fetchTransport()`                               | Sends HTTP to the mounted Astro endpoint.                                       |
| Ordinary server-rendered component or server island in the same process | `astroInProcessTransport(implementation, Astro)` | Dispatches locally with the current Astro context and no internal HTTP request. |
| Application-local form or function with no durable shared HTTP need     | Astro Action or native Astro behavior            | Keeps the operation in Astro instead of adding a contract-backed endpoint.      |

Keep `implementation` out of browser-reachable modules. A browser client imports only the shared
contract and reaches the mounted endpoint:

```ts
// src/api/browser-client.ts — browser-safe code
import { createClient } from "@hulla/api/client";
import { fetchTransport } from "@hulla/api/fetch";
import { contract } from "./contract";

export const api = createClient(contract, {
  transport: fetchTransport(),
});
```

For example, an Astro page can call that client from a browser script:

```astro
<!-- src/pages/index.astro -->
<button id="load-user" type="button">Load user</button>
<output id="user-result"></output>

<script>
  import { api } from '../api/browser-client'

  document.querySelector('#load-user')?.addEventListener('click', async () => {
    const result = await api.users.byId({ params: { id: 'ada' } })
    const output = document.querySelector('#user-result')
    if (output) output.textContent = result.status === 200 ? result.body.name : 'Unavailable'
  })
</script>
```

Use an absolute `baseUrl` when a server-side Fetch client has no request origin. Server-side Fetch
also does not inherit incoming cookies or headers unless the application forwards them explicitly.

## Call from a server-rendered component

When the implementation is colocated with the Astro server, use the current `Astro` render context:

```astro
---
// src/pages/users/[id].astro
import { astroInProcessTransport } from '@hulla/api-astro'
import { createClient } from '@hulla/api/client'
import { contract } from '../../api/contract'
import { implementation } from '../../api/server'

export const prerender = false

const api = createClient(contract, {
  transport: astroInProcessTransport(implementation, Astro),
})
const result = await api.users.byId({ params: { id: Astro.params.id! } })
if (result.status === 404) Astro.response.status = 404
---

{result.status === 200 ? <h1>{result.body.name}</h1> : <p>User unavailable</p>}
```

This call bypasses the mounted endpoint and Astro endpoint processing, but it still runs `@hulla/api`
route selection, input validation, middleware, handler execution, response encoding, and client
decoding. The explicit `Astro` argument keeps native context request-scoped.

## Render the same call in a server island

Astro owns the `server:defer` protocol. It serializes the component's props, renders the fallback,
requests the internal island endpoint, and replaces the fallback with the returned HTML. The island
can use the same in-process transport and contract route:

```astro
---
// src/components/UserCard.astro
import { astroInProcessTransport } from '@hulla/api-astro'
import { createClient } from '@hulla/api/client'
import { contract } from '../api/contract'
import { implementation } from '../api/server'

interface Props {
  id: string
}

const { id } = Astro.props
const api = createClient(contract, {
  transport: astroInProcessTransport(implementation, Astro),
})
const result = await api.users.byId({ params: { id } })
---

{result.status === 200 ? <article>{result.body.name}</article> : <p>Unavailable</p>}
```

```astro
---
// src/pages/profile.astro
import UserCard from '../components/UserCard.astro'
---

<UserCard id="ada" server:defer>
  <p slot="fallback">Loading user…</p>
</UserCard>
```

Pass only serializable page-derived values as island props. Inside the deferred component,
`Astro.request` describes Astro's internal `/_server-islands/...` request, not the page containing
the island. The client still selects `/api/users/:id` as the contract route. Derive identity and
authorization from trusted cookies or middleware-populated locals, not from an assumed containing-page
URL.

## Use native Astro context when needed

Most implementations can remain portable, as in the earlier example. Bind context to Astro only
when handlers need locals, cookies, route parameters, or another value from `APIContext`:

```ts
// src/api/server.ts — replace the portable implementation with this version
import { astroAdapter } from "@hulla/api-astro";
import { defineServer } from "@hulla/api/server";
import { contract } from "./contract";

export const adapter = astroAdapter();
const users = new Map([["ada", "Ada Lovelace"]]);

export const implementation = defineServer(contract, {
  context: adapter.context(({ astroContext, request, route }) => ({
    actor: astroContext.locals.actor,
    dispatchMethod: request.method,
    nativeMethod: astroContext.request.method,
    operation: route.key,
  })),
}).implement({
  users: {
    byId: ({ params, context, response }) => {
      const name =
        context.actor === params.id ? users.get(params.id) : undefined;
      return name === undefined
        ? response(404, { message: "User not found" })
        : response(200, { id: params.id, name });
    },
  },
});
```

Declare the local shape in `src/env.d.ts` and populate it in Astro middleware before mounting the
route:

```ts
// src/env.d.ts
/// <reference types="astro/client" />
declare namespace App {
  interface Locals {
    actor?: string;
  }
}
```

```ts
// src/middleware.ts
import { defineMiddleware } from "astro:middleware";

const sessions = new Map([["demo-session", "ada"]]);

export const onRequest = defineMiddleware(({ cookies, locals }, next) => {
  const session = cookies.get("session")?.value;
  locals.actor = session === undefined ? undefined : sessions.get(session);
  return next();
});
```

The replacement implementation returns the user only when the trusted `actor` local matches the
requested ID. The in-memory session map keeps the example complete; replace it with your
application's session verification before deployment.

For a mounted endpoint, the context `request` is the request dispatched through `@hulla/api`,
`astroContext.request` is Astro's original request, and `route` is the matched contract operation.
This is why an endpoint `HEAD` exposes `GET` through `request` while the native request remains
`HEAD`. For an in-process call, both request fields describe the supplied Astro page or island
request; `route` identifies the contract operation selected by the client.

`astroInProcessTransport()` accepts a portable implementation or one bound with
`astroAdapter().context()`. It rejects an implementation whose context is bound to a different
adapter.

## Handle endpoint errors and fragments

`onError` customizes failures from the mounted HTTP endpoint. It is not invoked by
`astroInProcessTransport()`; declared response statuses remain part of the client's result union.

```ts
// src/pages/api/[...api].ts
import { astroAdapter } from "@hulla/api-astro";
import { implementation } from "../../api/server";

export const prerender = false;
export const ALL = astroAdapter({
  onError({ error, phase, request, route, astroContext, defaultResponse }) {
    console.error({
      error,
      phase,
      url: request.url,
      operation: route?.key,
      path: astroContext.url.pathname,
    });
    return defaultResponse;
  },
}).mount(implementation);
```

`onError` may return a replacement `Response` or `undefined` to keep the protocol-safe default. A
complete implementation or independently executable fragment can be passed to `mount()` and to
`astroInProcessTransport()`; fragments preserve their original contract paths. Use the
[server composition guide](./server-composition.md) for composition decisions rather than assuming
that fragments provide code splitting or smaller server chunks.

## Deployment constraints and next decisions

Astro owns file routing, rendering, middleware, actions, deployment, and the server-island protocol.
`@hulla/api` owns contract matching, validation, middleware, handler execution, and declared
responses. Keep the boundary explicit when you need endpoint middleware, HTTP response headers, or a
separately deployed caller; use in-process transport when the implementation is safely colocated.

Next, read [server and browser calls](./hybrid-rendering.md) for transport selection,
[server context](./server-context.md) for reusable context and middleware, and [errors](./errors.md)
for declared failure responses. For host setup, see Astro's [on-demand rendering](https://docs.astro.build/en/guides/on-demand-rendering/),
[endpoints](https://docs.astro.build/en/guides/endpoints/), and [server islands](https://docs.astro.build/en/guides/server-islands/)
guides.
