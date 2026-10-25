# SWR

`@hulla/api-swr` turns your client routes into keys and fetchers for SWR 2. Use them with `useSWR` to load a user, then refresh the cached result after changing their name.

<!-- docs:package-manager -->

```sh
# Bun
bun add @hulla/api @hulla/api-swr swr zod

# npm
npm install @hulla/api @hulla/api-swr swr zod

# pnpm
pnpm add @hulla/api @hulla/api-swr swr zod

# Yarn
yarn add @hulla/api @hulla/api-swr swr zod
```

## Define the contract and browser client

In `src/api/contract.ts`, declare the successful and not-found responses for both a read and a mutation. Each client call resolves to a status-discriminated result, so the component must narrow `status` before reading `body`.

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

In `src/api/client.ts`, use the contract with the browser-safe Fetch transport. Omitting `baseUrl` makes requests relative to the current origin, so this client calls `/api/users/:id` and `/api/users/:id/rename`.

```ts
import { createClient } from "@hulla/api/client";
import { fetchTransport } from "@hulla/api/fetch";
import { contract } from "./contract";

export const client = createClient(contract, {
  transport: fetchTransport(),
});
```

## Create the SWR view

Create the integration once in `src/api/swr.ts`. `createSWR()` returns a parallel view of the client; it does not mutate or wrap the client.

```ts
import { createSWR } from "@hulla/api-swr";
import { client } from "./client";

export const swr = createSWR(client, { prefix: ["api"] });
```

The `prefix` is a cache-key namespace. It is not added to request URLs. For the contract above, the generated keys are:

| Expression                                              | Result                                                   |
| ------------------------------------------------------- | -------------------------------------------------------- |
| `swr.queryKey()`                                        | `['api']`                                                |
| `swr.users.queryKey()`                                  | `['api', 'users']`                                       |
| `swr.users.byId.queryKey()`                             | `['api', 'users', 'byId']`                               |
| `swr.users.byId.queryKey({ params: { id: 'user-1' } })` | `['api', 'users', 'byId', { params: { id: 'user-1' } }]` |

An input object is one structural key segment. SWR serializes the key structurally, so equivalent input values address the same cache entry. Keep route inputs serializable and structurally stable.

Input routes require a bound input for queries:

```ts
const input = { params: { id: "user-1" } };
const [key, fetcher] = swr.users.byId.queryOptions(input);
```

Calling `queryOptions()` without that input throws because the helper cannot execute an input route deterministically. An input-free route can use `queryOptions()` with no argument.

## Use a generated query and mutation in React

In `src/components/UserPanel.tsx`, pass the generated query tuple to `useSWR`. The bound mutation tuple is also compatible with `useSWRMutation`: its fetcher takes no argument because `mutationOptions(input)` already captured the input.

```tsx
import useSWR, { useSWRConfig } from "swr";
import useSWRMutation from "swr/mutation";
import { swr } from "../api/swr";

export function UserPanel() {
  const { mutate } = useSWRConfig();
  const input = { params: { id: "user-1" } };
  const exactReadKey = swr.users.byId.queryKey(input);
  const user = useSWR(...swr.users.byId.queryOptions(input));
  const [mutationKey, rename] = swr.users.rename.mutationOptions({
    params: { id: "user-1" },
    body: { name: "Ada" },
  });
  const mutation = useSWRMutation(mutationKey, rename);

  if (user.isLoading) return <p>Loading…</p>;
  if (user.error) return <p>Request failed: {user.error.message}</p>;
  if (user.data === undefined) return <p>Waiting for a response…</p>;

  if (user.data.status === 404) return <p>{user.data.body.message}</p>;

  async function renameUser() {
    try {
      const result = await mutation.trigger();
      if (result.status === 200) await mutate(exactReadKey);
    } catch {
      // SWR also exposes the rejected request through mutation.error.
    }
  }

  return (
    <section>
      <h2>{user.data.body.name}</h2>
      <button disabled={mutation.isMutating} onClick={() => void renameUser()}>
        Rename
      </button>
      {mutation.error ? <p>Rename failed: {mutation.error.message}</p> : null}
      {mutation.data?.status === 404 ? (
        <p>{mutation.data.body.message}</p>
      ) : null}
    </section>
  );
}
```

`mutate(exactReadKey)` asks SWR to revalidate the exact `users.byId` cache entry; the helper does not infer invalidation relationships from the contract.

`mutationOptions` has two forms:

```ts
// Bound: input is captured; useSWRMutation receives a zero-argument fetcher.
const bound = swr.users.rename.mutationOptions({
  params: { id: "user-1" },
  body: { name: "Ada" },
});

// Unbound: useSWRMutation's arg supplies the route input.
const unbound = swr.users.rename.mutationOptions();
```

The unbound tuple is `[key, (input) => result]`, while SWR’s mutation fetcher receives `(key, { arg })`. Adapt it at the hook boundary instead of passing the unbound tuple directly:

```tsx
const [renameKey, renameWithInput] = swr.users.rename.mutationOptions();
const mutation = useSWRMutation(
  renameKey,
  (_key, { arg }: { arg: Parameters<typeof renameWithInput>[0] }) =>
    renameWithInput(arg),
);

void mutation
  .trigger({
    params: { id: "user-1" },
    body: { name: "Ada" },
  })
  .catch(() => undefined);
```

`trigger()` rejects by default when the request fails. Catch the promise in imperative code; the
hook still exposes the same failure through `mutation.error`.

The bound form is usually shorter when a component edits one known resource. Use the unbound form when the same mutation hook should receive different route inputs over time.

## Understand results and errors

Declared route statuses are data. A `404` is not an SWR error; it is returned in `data` and must be narrowed like the `200` result in the component above.

Named errors declared with `defineErrors` follow the client's `errorMode`. The default, `'return'`, returns them as data. Choose `'throw'` to reject with a `DeclaredError`.

Operational failures always reject and populate SWR's `error`: a failed transport, unexpected status, content-type mismatch, or failed response decoding.

SWR’s `error` describes a rejected promise. It does not replace status narrowing for declared HTTP responses.

## Keep cache scope and ownership explicit

`@hulla/api-swr` does not install or configure `SWRConfig`, create a cache provider, choose retries or revalidation, perform hydration, or implement optimistic updates. SWR and the surrounding React/framework integration own those policies. The helper only supplies structural keys and fetchers that call the existing client.

Use a prefix to separate clients that share one SWR cache:

```ts
const tenantSWR = createSWR(client, {
  prefix: ["api", tenantId, sessionVersion],
});
```

Recreate the view when the tenant or authentication scope changes. Do not put access tokens, cookies, or other credentials in keys. On logout, clear sensitive entries through SWR’s cache/mutation API before discarding the authenticated client state.

For server rendering, fallback data, hydration, and custom cache providers, follow the current [SWR documentation](https://swr.vercel.app/docs). Those are SWR/framework-owned lifecycles; `createSWR()` does not create request-scoped caches or hydrate them.

## Constraints

- A contract node named `queryKey` is reserved by the integration. `createSWR()` throws if it encounters that name; rename the contract node.
- `queryOptions(input)` requires input for routes with request data. `queryKey(input)` and bound `mutationOptions(input)` use the same input as their final structural key segment.
- Query and mutation keys contain route inputs. Keep those inputs serializable and structurally stable.
- The helper does not bridge an `AbortSignal` into SWR’s query or mutation lifecycle. Do not assume that unmounting, revalidation, or mutation cancellation aborts the underlying `@hulla/api` request.
- `createSWR()` is a parallel integration view. It does not add methods to the client, call hooks, configure SWR, or change the client transport.

## Next steps

Return to [choosing a query-library integration](./plugins.md), review [client authoring](./client-authoring.md) for the underlying request boundary, or use the [error model](./errors.md) to choose between returned and thrown named errors.
