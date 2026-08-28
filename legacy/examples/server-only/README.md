# Server-only example

Use `@hulla/api` as a small server toolkit without generating or shipping a client.

This example demonstrates:

- internal procedures that can only be called inside the server process;
- explicit public routes with HTTP methods and paths;
- Zod input and output validation;
- request-scoped middleware;
- a Fetch-compatible handler that can be mounted in Bun, Node, Hono, Elysia, or another runtime.

The smoke check calls the handler in-process and proves that the internal procedure is not reachable over HTTP:

```sh
bun install
bun run check
```

See [`src/server.ts`](./src/server.ts) for the definitions and [`src/smoke.ts`](./src/smoke.ts) for direct and HTTP calls.
