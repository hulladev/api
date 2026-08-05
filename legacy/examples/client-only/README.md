# Client-only example

Use Hulla without owning the server. Procedures wrap any existing transport and give the rest of the client one validated, typed interface.

This example demonstrates:

- client-side procedures with Zod input and output validation;
- a transport interface that can be backed by `fetch`, an SDK, local storage, or test data;
- namespaced TanStack Query helpers such as `.$tanstack.queryOptions()`;
- namespaced SWR helpers such as `.$swr.queryOptions()`;
- query and mutation helpers sharing the same procedure contract.

The example uses an in-memory transport so its smoke check never needs a network connection:

```sh
bun install
bun run check
```

See [`src/client.ts`](./src/client.ts) for the procedure definitions and [`src/smoke.ts`](./src/smoke.ts) for framework-ready query and mutation options.
