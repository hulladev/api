# Choose a query-library integration

Your API client fetches data. Add a query library when several components need to share that data, show loading states, or refresh it after a change.

Use the client directly when a framework loader or ordinary function already does what you need.

| You use | Add | The helper gives you |
| --- | --- | --- |
| TanStack Query v5 | [`@hulla/api-tanstack-query`](./tanstack-query.md) | Query keys and query/mutation options |
| SWR 2 | [`@hulla/api-swr`](./swr.md) | Keys and fetchers for reads and mutations |
| A framework loader or plain function | Nothing extra | Call the client directly |

## The shared mental model

Both integrations create a parallel, contract-shaped view over a client that already exists:

```ts
const query = createTanStackQuery(client);
const swr = createSWR(client);
```

They do not mutate `client`, add `$` properties, or run hooks during client creation. They also do not own the
transport, cache policy, retries, hydration, or framework lifecycle. The selected query library owns those policies;
the integration only derives typed keys and executable helpers from the client's route tree.

The helper must receive input for a route that declares request data. An input-free route can use
`queryOptions()` without an argument. In both views, `queryKey` is reserved as an integration name, so a contract
node with that name cannot be represented in the generated integration tree.

## Cache scope and response behavior

Pass a string-only `prefix` when separate clients share one query-library cache:

```ts
const query = createTanStackQuery(client, {
  prefix: ["service", tenantId, sessionVersion],
});
const swr = createSWR(client, {
  prefix: ["service", tenantId, sessionVersion],
});
```

`prefix` is a cache namespace, not a URL prefix. Include the tenant, authentication, or session scope needed to keep
entries separate, but never put credentials in a key. Recreate the integration when that scope changes and clear
sensitive cached data when the user signs out.

> A declared 4xx or 5xx response is data by default. Narrow `result.status` before reading its `body`; configure the
> client with `errorMode: 'throw'` only when named declared errors should reject instead. Operational, transport, and
> schema failures reject regardless.

Choose the focused guide for the cache owner you selected:

- [TanStack Query](./tanstack-query.md) shows query and mutation options, cancellation, and prefix invalidation.
- [SWR](./swr.md) shows key/fetcher tuples, mutation tuples, and revalidation.

For the underlying client call and response contract, see [client authoring](./client-authoring.md). For status,
declared-error, transport, and schema failure behavior, see [errors](./errors.md).
