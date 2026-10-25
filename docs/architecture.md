# Contract compiler

`compileContract()` returns a flat list of routes with their keys, methods, and paths. Use it when building a tool or integration that needs to inspect a contract.

Clients and server adapters compile contracts for you. You don't need this API to make or handle a request.

## Read the compiled routes

Assuming `./contract` exports the value created by `defineContract()`, import `compileContract` and its public types from `@hulla/api/compiler`:

```ts
import { compileContract } from "@hulla/api/compiler";
import type { CompiledContractRoute } from "@hulla/api/compiler";
import { contract } from "./contract";

const compiled = compileContract(contract);
const routes: readonly CompiledContractRoute[] = compiled.routes;

for (const route of routes) {
  console.log(route.key.join("."), route.method, route.path);
}
```

`defineContract()` has already validated and flattened the route tree. `compileContract()` exposes that manifest; it does not dispatch a request, create a client, or mount a server. The result contains the original `contract` and its `routes` in declaration order, with nested router children visited depth first. The returned object and manifest are frozen.

## Public exports

The `@hulla/api/compiler` subpath exposes these six names:

| Export                     | Use                                                |
| -------------------------- | -------------------------------------------------- |
| `compileContract`          | Read a contract as a flat, typed route manifest.   |
| `CompiledContract`         | Type of the contract plus its compiled routes.     |
| `CompiledContractRoute`    | Type of one route-manifest entry.                  |
| `CompiledContractRouteFor` | Contract-specific union of route-manifest entries. |
| `CompiledPathParameters`   | Type of one path scope's names and schema.         |
| `freezeCompiledRoutes`     | Freeze an already-built route manifest in place.   |

Most consumers only need `compileContract` and, when typing a tool, one of the manifest types.

## Route entry fields

Each `CompiledContractRoute` describes one route in both the contract's property tree and its HTTP path:

| Field            | Meaning                                                                                      |
| ---------------- | -------------------------------------------------------------------------------------------- |
| `key`            | Property names from the contract root to this route, such as `['organizations', 'getUser']`. |
| `method`         | The declared HTTP method.                                                                    |
| `path`           | The complete path, including the contract base path and every parent router path.            |
| `pathParameters` | Parameter schemas declared at each path scope, from the outermost router to the route.       |
| `route`          | The original route declaration without its mounted `$contract` metadata.                     |

`CompiledContractRouteFor<typeof contract>` is the inferred union of route entries for a specific contract. Its keys, methods, paths, and route declarations stay correlated, so a tool can narrow the union by `key` or `method` without losing the matching path type.

## Inherited path parameters

`pathParameters` keeps each schema beside the path segment where it was declared. A route nested under `/organizations/:organizationId` and `/users/:userId` has two entries in that order. The adapter can therefore validate each parameter scope with its declared schema while tooling can associate parameter names with the path that introduced them.

The route's complete `path` is useful for HTTP registration. Its `key` is useful for matching a manifest entry back to the contract's nested property tree. These values answer different questions; do not derive one from the other when your integration needs both.

## Selections

`defineContract()` attaches `$contract` metadata to the root contract, each router, and each route. This lets `createClient()` and `server.implement()` bind to a selected node without reconstructing its paths or parameter schemas. Application code should pass a selection directly to those APIs; the metadata is useful mainly to integrations that build their own tooling.

## Freezing an existing manifest

`freezeCompiledRoutes(routes)` is a low-level helper for integrations that construct compiled route records. It freezes the supplied array and, in place, each entry's `key`, `pathParameters` array, path-parameter records and their `names` arrays, and the route entry itself. It returns the same array. It does not compile, validate, or clone the input, and it does not freeze the original route declaration or schemas referenced by the manifest.

Normal application code should not need this helper. Use `compileContract()` to read a contract's manifest; that API returns the frozen manifest prepared by `defineContract()`.

For the related authoring workflows, see [contracts](./contract-authoring.md), [server implementations](./server-authoring.md), and [typed clients](./client-authoring.md).
