# TanStack Start

Serve your API from a TanStack Start wildcard [server route](https://tanstack.com/start/latest/docs/framework/react/guide/server-routes). Browser code and other apps can then call the contract's routes over HTTP.

For an operation used only by your Start app, a [server function](https://tanstack.com/start/latest/docs/framework/react/guide/server-functions) can call the implementation directly. We'll cover both approaches after mounting the API.

## Install the integration

Start with an existing TanStack Start application. Its Start and Vite configuration should already work before you add the API packages.

<!-- docs:package-manager -->

```sh
# Bun
bun add @hulla/api @hulla/api-tanstack-start zod

# npm
npm install @hulla/api @hulla/api-tanstack-start zod

# pnpm
pnpm add @hulla/api @hulla/api-tanstack-start zod

# Yarn
yarn add @hulla/api @hulla/api-tanstack-start zod
```

The adapter declares `@tanstack/react-start ^1.160.0` as a peer dependency. Keep the Start packages in the application on compatible versions.

## Define the contract and implementation

Keep the contract in shared code so server code and HTTP clients use the same paths and response variants. This example declares `GET /api/health` and `POST /api/users`:

```ts
// src/api/contract.ts
import { defineContract, response, route, router } from "@hulla/api";
import { z } from "zod";

const user = z.object({
  id: z.string(),
  name: z.string(),
});

export const contract = defineContract({
  basePath: "/api",
  routes: {
    health: route.get("/health", {
      responses: { 200: response.json(z.literal("ok")) },
    }),
    users: router("/users", {
      routes: {
        create: route.post("/", {
          body: z.object({ name: z.string().min(1) }),
          responses: { 201: response.json(user) },
        }),
      },
    }),
  },
});
```

Implement the same route tree in server code:

```ts
// src/api/server.ts
import { defineServer } from "@hulla/api/server";
import { contract } from "./contract";

export const implementation = defineServer(contract).implement({
  health: ({ response }) => response(200, "ok"),
  users: {
    create: ({ body, response }) =>
      response(201, { id: "user-1", name: body.name }),
  },
});
```

The contract's `basePath` is `/api`, so the host route must pass requests beneath `/api` to the adapter. See [contract authoring](./contract-authoring.md) and [server implementations](./server-authoring.md) for the complete authoring APIs.

## Mount a wildcard server route

Create a `$` wildcard route and give its server configuration the handler map returned by `mount()`:

```ts
// src/routes/api/$.ts
import { tanStackStartAdapter } from "@hulla/api-tanstack-start";
import { createFileRoute } from "@tanstack/react-router";
import { implementation } from "~/api/server";

export const Route = createFileRoute("/api/$")({
  server: {
    handlers: tanStackStartAdapter().mount(implementation),
  },
});
```

`mount()` returns one handler for each supported HTTP method present in the implementation or fragment: `DELETE`, `GET`, `PATCH`, `POST`, and `PUT`. Start matches `/api/$` first; `@hulla/api` then matches the native method and complete URL against the mounted contract.

The host wildcard and contract parameters are separate:

- Start's `params._splat` identifies the remainder captured by `/api/$`.
- A contract handler receives the decoded parameters declared by its operation.

TanStack Start server routes cannot expose `@hulla/api`'s `QUERY` method. `mount()` rejects an implementation or fragment containing a `QUERY` route during setup.

## Verify the HTTP boundary

Start the application with its normal development command. The port may differ in your project; the examples use `http://localhost:3000`.

Call the read route:

```sh
curl -i http://localhost:3000/api/health
```

The server route returns:

```http
HTTP/1.1 200 OK
content-type: application/json

"ok"
```

Call the mutation route:

```sh
curl -i \
  -X POST \
  -H 'content-type: application/json' \
  -d '{"name":"Ada"}' \
  http://localhost:3000/api/users
```

The server route returns the declared `201` variant:

```http
HTTP/1.1 201 Created
content-type: application/json

{"id":"user-1","name":"Ada"}
```

## Choose a caller for each boundary

| Caller or data flow                                              | Use                                                               |
| ---------------------------------------------------------------- | ----------------------------------------------------------------- |
| Browser or external process calling the HTTP API                 | `fetchTransport()` pointed at the wildcard server route           |
| Start loader or component calling application-local server logic | A Start server function backed by a server-only in-process client |
| Server-only code that already runs beside the implementation     | `inProcessTransport(implementation)` directly                     |
| Data shared through a browser cache                              | `@hulla/api-tanstack-query` around the appropriate client         |

Use a browser-safe client with `fetchTransport()` when the browser or another process must call the mounted HTTP route:

```ts
// src/api/browser-client.ts
import { createClient } from "@hulla/api/client";
import { fetchTransport } from "@hulla/api/fetch";
import { contract } from "./contract";

export const api = createClient(contract, {
  transport: fetchTransport(),
});
```

For another origin, pass an absolute `baseUrl` to `fetchTransport()`. Server-rendered callers need an absolute origin unless the application supplies a request-aware Fetch, and authenticated server calls must explicitly forward the credentials they need.

Use a Start server function for application-local RPC. Its handler can dynamically import a server-only client so the implementation never enters a browser bundle:

```ts
// src/api/local.server.ts
import { createClient } from "@hulla/api/client";
import { inProcessTransport } from "@hulla/api/in-process";
import { contract } from "./contract";
import { implementation } from "./server";

export const api = createClient(contract, {
  transport: inProcessTransport(implementation),
});
```

```ts
// src/api/health.functions.ts
import { createServerFn } from "@tanstack/react-start";

export const getHealth = createServerFn({ method: "GET" }).handler(async () => {
  const { api } = await import("./local.server");
  const result = await api.health();
  return result.body;
});
```

Import that server function from a route loader:

```tsx
// src/routes/index.tsx
import { createFileRoute } from "@tanstack/react-router";
import { getHealth } from "../api/health.functions";

export const Route = createFileRoute("/")({
  loader: () => getHealth(),
  component: Page,
});

function Page() {
  const health = Route.useLoaderData();
  return <main>API status: {health}</main>;
}
```

Start loaders are isomorphic: they can run during server rendering and again in the browser. Keeping the local client behind a server function prevents the implementation and its dependencies from crossing into the browser build.

The in-process transport applies the contract client/server boundary, but it does not enter the mounted HTTP route, match its URL, or run Start route middleware. It still runs the `@hulla/api` context, middleware, handler, and response pipeline. Use the HTTP client when the native HTTP boundary is part of the behavior you need.

For data shared across routes, optionally use [`@hulla/api-tanstack-query`](./tanstack-query.md) with `createTanStackQuery()`. TanStack Query owns cache keys, hydration, optimistic updates, mutations, and invalidation; the Start adapter does not create query options or cache policy.

## Use native Start context

Use `adapter.context()` when a contract handler needs the native request, Start middleware context, or host-route parameters:

```ts
// src/api/server-with-context.ts
import { defineServer } from "@hulla/api/server";
import { tanStackStartAdapter } from "@hulla/api-tanstack-start";
import { contract } from "./contract";

type StartContext = {
  readonly session: { readonly userId: string };
};

type StartParams = {
  readonly _splat: string | undefined;
};

const adapter = tanStackStartAdapter<StartContext, StartParams>();

export const server = defineServer(contract, {
  context: adapter.context(({ request, route, startContext, startParams }) => ({
    request,
    operation: route.key,
    session: startContext.session,
    splat: startParams._splat,
  })),
});
```

The context factory receives `request`, `startContext`, `startParams`, and the matched contract `route`. An implementation created with this adapter-bound context cannot be passed to `inProcessTransport()` or another adapter because those transports cannot supply Start's native context. Keep context construction portable when it needs only contract metadata or request-independent services.

## Customize adapter errors

Use `onError` for Start-aware logging or to replace the protocol-safe default response:

```ts
import { tanStackStartAdapter } from "@hulla/api-tanstack-start";
import { implementation } from "./server";

const adapter = tanStackStartAdapter({
  onError({ error, phase, request, route, defaultResponse }) {
    console.error(phase, request.url, route?.key, error);
    return defaultResponse;
  },
});

export const handlers = adapter.mount(implementation);
```

The hook receives the native request, matched contract route when available, error phase, and `@hulla/api`'s protocol-safe default `Response`. Return a replacement `Response` to customize the result, or return `undefined` to keep the default.

## Mount only the contract subtree a boundary owns

Use a fragment when a server route or deployment owns only part of the contract. This fragment selects the `users` router declared earlier and therefore exposes only its `POST` method:

```ts
// src/api/users.server.ts
import { defineServer } from "@hulla/api/server";
import { contract } from "./contract";

const server = defineServer(contract);

export const usersImplementation = server.implement(contract.routes.users, {
  create: ({ body, response }) =>
    response(201, { id: "user-1", name: body.name }),
});
```

Mount the fragment instead of the complete implementation in the boundary that owns `/api/users`:

```ts
// src/routes/api/$.ts
import { tanStackStartAdapter } from "@hulla/api-tanstack-start";
import { createFileRoute } from "@tanstack/react-router";
import { usersImplementation } from "~/api/users.server";

export const Route = createFileRoute("/api/$")({
  server: {
    handlers: tanStackStartAdapter().mount(usersImplementation),
  },
});
```

The host route still passes the complete `/api/users` URL to the adapter; selecting a fragment does not rewrite its contract paths. Use fragments for separate deployment, middleware, cold-start, or ownership boundaries—not merely to shorten one handler file. Keep raw Start routes for endpoints that benefit more from Start's native `Request`/`Response` behavior than from a shared contract.

For shared context and middleware, continue to [context and middleware](./server-context.md). For declared application failures, see [errors](./errors.md). For fragment composition rules, see [fragments and composition](./server-composition.md).
