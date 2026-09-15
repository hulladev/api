# Interactive example

A guided web demonstration that starts with the client-only model in `@hulla/api` and progressively unlocks optional capabilities:

1. **Routers and procedures** — group useful task behavior into a type-safe, DRY feature boundary.
2. **Schemas and middleware** — infer inputs and shared context through the complete call.
3. **Existing systems** — consume OpenAPI and keep full control of the supplied `fetch` transport.
4. **Optional backend** — add public routes in a separate backend app while preserving standard HTTP and plain-fetch access.
5. **Plugins and generation** — see where a plugin is registered, how generation preserves it, and which files are generator-owned.
6. **Generated DX and state** — derive typed calls, TanStack Query options, and a TanStack DB collection from the same routes.

The page is one continuous, user-paced learning path rather than separate feature labs. Every editor includes a clickable project explorer so the backend, authored configuration, transport wrapper, and generated files remain visibly distinct. The teaching device changes with the concept: a router member browser, live validation, middleware comparison, HTTP contract, plugin surface, generation console, transport capture, cache pipeline, or local-first timeline.

The editable Monaco workbenches load the real built `@hulla/api` declarations, the real generated client, and the example's backend source into a virtual TypeScript project. Generated browser types are standalone stubs derived from the generated HTTP contract; they do not import the backend repository. Schema output therefore flows into handler inputs, middleware context, procedure calls, generated results, and plugin options without `any`-based demo stubs. At the HTTP stages, a live inspector holds the exact request and response while the user compares plain `fetch` with the generated call. The cache and TanStack DB stages share an adjustable real transport delay, making cache hits and immediate optimistic updates directly comparable with slow server acknowledgement.

The backend is an optional later stage in the tour. Unlike the monorepo example, it has no shared API workspace. [`api.config.ts`](./api.config.ts) discovers its router files and keeps every generator-owned client artifact under `apps/web/src/api/generated`:

```text
apps/backend/src/api/*.router.ts
              ↓ bun run generate
apps/web/src/api/generated/*
```

## Run it

```bash
bun install
bun run dev
```

- Web: `http://localhost:3000`
- Backend: `http://localhost:3001`

Run the complete generation, type, browser build, and in-process transport checks with:

```bash
bun run check
```
