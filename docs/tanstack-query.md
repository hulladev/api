# TanStack Query

`@hulla/api-tanstack-query` creates query keys and options from your API client. Pass them to TanStack Query v5 to load data and invalidate the matching query after a write.

<!-- docs:package-manager -->

```sh
# Bun
bun add @hulla/api @hulla/api-tanstack-query @tanstack/react-query zod

# npm
npm install @hulla/api @hulla/api-tanstack-query @tanstack/react-query zod

# pnpm
pnpm add @hulla/api @hulla/api-tanstack-query @tanstack/react-query zod

# Yarn
yarn add @hulla/api @hulla/api-tanstack-query @tanstack/react-query zod
```

The concrete example below uses React Query v5. Other TanStack Query framework bindings own their provider and hook setup; the generated options remain the same.

## Define the contract and browser client

In `src/api/contract.ts`, declare both the successful and not-found representations. A client result is a value with an HTTP `status`; its body is only available after narrowing that status.

```ts
import { defineContract, request, response, route, router } from "@hulla/api";
import { z } from "zod";

export const contract = defineContract({
  basePath: "/api",
  routes: {
    users: router("/users", {
      routes: {
        byId: route.get("/:id", {
          params: z.object({ id: z.string() }),
          responses: {
            200: response.json(z.object({ id: z.string(), name: z.string() })),
            404: response.json(z.object({ message: z.string() })),
          },
        }),
        rename: route.post("/:id/rename", {
          params: z.object({ id: z.string() }),
          body: request.json(z.object({ name: z.string().min(1) })),
          responses: {
            200: response.json(z.object({ id: z.string(), name: z.string() })),
            404: response.json(z.object({ message: z.string() })),
          },
        }),
      },
    }),
  },
});
```

In `src/api/client.ts`, use the same contract with a browser-safe relative Fetch transport. `fetchTransport()` uses the current origin when no `baseUrl` is supplied, so the browser calls the mounted `/api` endpoint.

```ts
import { createClient } from "@hulla/api/client";
import { fetchTransport } from "@hulla/api/fetch";
import { contract } from "./contract";

export const client = createClient(contract, {
  transport: fetchTransport(),
});
```

## Create the TanStack Query view

Create the integration once beside the client, or in another browser-safe module that imports it. The `prefix` is a cache-key namespace, not a URL prefix.

```ts
import { createTanStackQuery } from "@hulla/api-tanstack-query";
import { client } from "./client";

export const query = createTanStackQuery(client, { prefix: ["api"] });
```

Save that module as `src/api/query.ts`; the component can then import the already-created view.

The generated keys for the contract above are:

| Expression                                                | Result                                                   |
| --------------------------------------------------------- | -------------------------------------------------------- |
| `query.queryKey()`                                        | `['api']`                                                |
| `query.users.queryKey()`                                  | `['api', 'users']`                                       |
| `query.users.byId.queryKey()`                             | `['api', 'users', 'byId']`                               |
| `query.users.byId.queryKey({ params: { id: 'user-1' } })` | `['api', 'users', 'byId', { params: { id: 'user-1' } }]` |

The route input is part of the exact key. TanStack Query hashes object key segments structurally, so use stable, serializable route inputs rather than values whose identity or serialization changes unexpectedly.

## Use the options in a React component

In `src/components/UserPanel.tsx`, pass the generated objects directly to React Query. The read query narrows the HTTP response status before reading `body`. The mutation uses the unbound overload, so `mutate` receives the route input. After a successful rename, invalidate the exact generated read key.

```tsx
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { query } from "../api/query";

export function UserPanel() {
  const queryClient = useQueryClient();
  const input = { params: { id: "user-1" } };
  const user = useQuery(query.users.byId.queryOptions(input));
  const rename = useMutation(query.users.rename.mutationOptions());

  if (user.isPending) return <p>Loading…</p>;
  if (user.isError) return <p>Request failed: {user.error.message}</p>;

  if (user.data.status === 404) return <p>User not found.</p>;
  if (user.data.status !== 200) return <p>Unexpected response.</p>;

  return (
    <section>
      <h2>{user.data.body.name}</h2>
      <button
        disabled={rename.isPending}
        onClick={() =>
          rename.mutate(
            { params: { id: "user-1" }, body: { name: "Ada" } },
            {
              onSuccess: (result) => {
                if (result.status === 200) {
                  void queryClient.invalidateQueries({
                    queryKey: query.users.byId.queryKey(input),
                  });
                }
              },
            },
          )
        }
      >
        Rename
      </button>
      {rename.isError ? <p>Rename failed: {rename.error.message}</p> : null}
      {rename.data?.status === 404 ? <p>{rename.data.body.message}</p> : null}
    </section>
  );
}
```

For an input route, `query.users.byId.queryOptions()` is invalid: bind the input with `queryOptions(input)`. `mutationOptions` has two overloads: `mutationOptions(input)` binds the input and returns a zero-argument `mutationFn`; `mutationOptions()` returns an unbound `mutationFn(input)`. Input-free routes use `queryOptions()` and `mutationOptions()` without arguments.

## Understand ownership and failures

`@hulla/api-tanstack-query` does not create or configure a `QueryClient`, install hooks, own cache storage, choose retry or stale-time policy, implement optimistic updates, or perform invalidation by itself. TanStack Query owns those decisions; the integration only supplies typed keys and executable options. The original `@hulla/api` client remains directly callable.

Every response status declared on a route is returned as data. A `200` or `404` result therefore belongs in `data`, and the component must narrow `data.status` before reading the corresponding body. TanStack Query’s `isPending`, `isError`, and related fields describe query execution; they are not HTTP status codes.

If the contract declares named errors with `defineErrors`, the default client mode (`errorMode: 'return'`) also returns those error responses as data. Construct the client with `errorMode: 'throw'` when the application wants a declared failure to reject as `DeclaredError`. Transport failures, unexpected statuses, content-type mismatches, and response-schema failures reject regardless of that declared-error policy and are surfaced to TanStack Query as query or mutation errors.

TanStack Query passes an `AbortSignal` to a query function. The generated `queryFn` forwards that signal into the `@hulla/api` request, allowing the Fetch transport and downstream work to observe cancellation. The mutation helper does not invent a cancellation mechanism; use the mutation and transport APIs’ own lifecycle controls.

## Namespaces, authentication, and server rendering

Use a string `prefix` when multiple clients share one TanStack Query cache, for example `{ prefix: ['api', tenantId, sessionVersion] }`. Recreate the integration when the tenant or authentication scope changes. Do not put credentials or tokens in keys. On logout, remove or clear sensitive queries through the application’s `QueryClient` policy.

SSR and hydration remain application-, TanStack Query-, and framework-owned. Create request-scoped `QueryClient` instances, prefetch and dehydrate on the server, then hydrate through the framework’s supported boundary; this package only supplies the query options used in those calls. See the current [TanStack Query SSR and hydration guide](https://tanstack.com/query/latest/docs/framework/react/guides/ssr).

## Constraints

- A contract node named `queryKey` is reserved by the integration and causes construction to fail.
- Query and mutation keys include route inputs; keep those inputs structurally stable and serializable.
- `createTanStackQuery()` is an explicit parallel view. It does not mutate the client, add properties to it, or run React hooks during construction.

## Next steps

Return to [choosing a query-library integration](./plugins.md), review [client authoring](./client-authoring.md) for the underlying request boundary, or use the [error model](./errors.md) to choose between returned and thrown named errors.
