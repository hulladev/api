# Monorepo example

A full-stack monorepo example that uses a fitness tracker to exercise the local Hulla API experience end to end.

## Stack

- `apps/backend`: Hono on Bun, Drizzle ORM, and SQLite
- `apps/mobile`: Expo SDK 57 and React Native, sharing the generated client and TanStack DB collection
- `apps/web`: TanStack Start with TanStack DB backed by TanStack Query
- `packages/api-client`: generated Hulla client, server router factory, and TanStack DB collection factories
- Turborepo for app tasks

The unpublished Hulla packages are installed from this repository with `file:` dependencies. Before generation, a local linking script points each workspace directly at the current package builds, so the example exercises this checkout and works in CI without a globally installed CLI or Bun link registrations.

## Run it

```sh
bun run --cwd ../.. build
bun install
bun run dev
```

Open `http://localhost:3000`. The Hono API listens on `http://localhost:3001`, and Vite proxies `/api` during development.

Run the Expo app separately with:

```sh
bun run dev:backend
bun run dev:mobile
```

The iOS simulator uses `http://localhost:3001`; the Android emulator uses `http://10.0.2.2:3001`. For a physical device, point Expo at the computer's LAN address:

```sh
EXPO_PUBLIC_API_URL=http://192.168.1.20:3001 bun run dev:mobile
```

Useful checks:

```sh
bun run generate   # generate from api.config.ts with the local packages
bun run smoke      # generated client -> Hono -> Drizzle CRUD
bun run check      # generate, typecheck, build, smoke
```

Generated artifacts are intentionally ignored. Delete them at any time and run `bun run generate` to rebuild the HTTP client, server router factory, and contract manifest.

## Local integration notes

This project intentionally keeps two compatibility choices visible while the local packages are under development:

- Vite and Metro resolve generated client imports through the browser-safe `@hulla/api/runtime` entry, keeping Node-only generation helpers out of client bundles.
- The workspace uses the same Drizzle release as the linked `@hulla/api-drizzle` checkout. TypeScript path aliases keep both projects on one nominal Drizzle type instance while testing local symlinked packages.
