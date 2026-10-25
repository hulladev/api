# Export a contract to OpenAPI

Generate an OpenAPI JSON or YAML file from your contract with `@hulla/api-openapi`. Keep route definitions in the contract and add descriptions in a separate documentation file.

## Install the exporter

Install the package beside `@hulla/api` and the Standard Schema library used by the contract. This guide uses Zod.

<!-- docs:package-manager -->

```sh
# Bun
bun add @hulla/api @hulla/api-openapi zod

# npm
npm install @hulla/api @hulla/api-openapi zod

# pnpm
pnpm add @hulla/api @hulla/api-openapi zod

# Yarn
yarn add @hulla/api @hulla/api-openapi zod
```

## Declare the runtime contract

Place the runtime contract in `src/api/contract.ts`. Its `basePath`, route path, parameters, and declared responses determine the HTTP structure of the generated document.

```ts
import { defineContract, response, route } from "@hulla/api";
import { z } from "zod";

const user = z.object({
  id: z.string(),
  name: z.string(),
});

export const contract = defineContract({
  basePath: "/api",
  routes: {
    getUser: route.get("/users/:id", {
      params: z.object({ id: z.string() }),
      responses: {
        200: response.json(user),
        404: response.json(z.object({ message: z.string() })),
      },
    }),
  },
});
```

## Add the documentation sidecar

Create `src/api/openapi.ts` beside the contract. The sidecar mirrors the contract route tree and documents every declared response status.

```ts
import { defineOpenAPI } from "@hulla/api-openapi";
import { contract } from "./contract";

export default defineOpenAPI(contract, {
  info: {
    title: "Users API",
    version: "1.0.0",
  },
  routes: {
    getUser: {
      summary: "Get a user",
      tags: ["Users"],
      request: {
        path: {
          id: { description: "User identifier" },
        },
      },
      responses: {
        200: { description: "The requested user" },
        404: { description: "No user has that identifier" },
      },
    },
  },
});
```

`defineOpenAPI()` returns a build-time definition. It does not mutate the runtime contract or attach metadata to clients and server implementations.

Every contract route must appear in the sidecar. To omit a declared `internalHealth` route, set its sidecar value to `{ include: false, reason: 'This operation is only reachable inside the worker network.' }`.

Generation fails when a route is missing, a route or response key is unknown, or an included route does not describe every route and contract-error status. That runtime validation also catches sidecars assembled through intermediate variables, where TypeScript cannot apply excess-property checks.

## Generate and inspect the document

Run the CLI from the project root. The input module must default-export `defineOpenAPI(...)`.

```sh
hulla-openapi export ./src/api/openapi.ts --output ./openapi.yaml
```

The output extension selects the serializer: `.yaml` and `.yml` produce YAML; other extensions produce formatted JSON. The command creates missing parent directories.

A successful export creates `openapi.yaml`. This excerpt shows the observable path, parameter, and response mapping:

```yaml
openapi: 3.1.2
info:
  title: Users API
  version: 1.0.0
paths:
  /api/users/{id}:
    get:
      tags:
        - Users
      summary: Get a user
      operationId: getUser
      parameters:
        - name: id
          in: path
          required: true
          description: User identifier
          schema:
            type: string
      responses:
        "200":
          description: The requested user
          content:
            application/json:
              schema:
                type: object
                properties:
                  id:
                    type: string
                  name:
                    type: string
                required:
                  - id
                  - name
                additionalProperties: false
        "404":
          description: No user has that identifier
          content:
            application/json:
              schema:
                type: object
                properties:
                  message:
                    type: string
                required:
                  - message
                additionalProperties: false
```

OpenAPI 3.1.2 is the default. An included HTTP `QUERY` route must set `openapi: '3.2.0'` in the sidecar; generation rejects `QUERY` under OpenAPI 3.1. An excluded `QUERY` route emits no operation and does not require 3.2.

## Generate from application code

The CLI calls the same public functions available to a build script. For example, a project-root `export-openapi.ts` can contain:

```ts
import {
  createOpenAPIDocument,
  writeOpenAPIDocument,
} from "@hulla/api-openapi";
import definition from "./src/api/openapi";

const document = await createOpenAPIDocument(definition);
await writeOpenAPIDocument("./openapi.yaml", document);
```

Run that TypeScript build script with the application's TypeScript runner, for example `bun ./export-openapi.ts`.

`createOpenAPIDocument()` is asynchronous because optional docstring extraction reads the contract source. `writeOpenAPIDocument()` applies the same extension-based JSON or YAML behavior as the CLI.

## Understand which schema is exported

The exporter describes values on the HTTP wire:

- path, query, header, and request-body schemas use Standard JSON Schema input conversion;
- response bodies, response headers, and declared error data use output conversion;
- `@hulla/api` codecs expose their wire-side schema rather than the richer application value;
- a sidecar `schema` override supplies the complete OpenAPI schema when conversion is unavailable or the published representation should differ.

Bytes, text, and JSON bodies have built-in fallback schemas. Structural path, query, and header parameters require Standard JSON Schema conversion; their sidecar documentation cannot replace the schema. Form data needs conversion or a request-body override. Raw and streamed responses need an explicit complete-response schema; streams cannot be inferred from individual chunks.

The current typed sidecar represents top-level routes and routes nested under one router. Deeper router nesting remains valid in an `@hulla/api` runtime contract but cannot be documented by `defineOpenAPI()` without unsafe casts. Flatten the documentation boundary or split the contract before exporting it.

## Use docstrings as optional fallback metadata

When descriptions already live beside the route declarations, add `docstrings: { source: new URL('./contract.ts', import.meta.url) }` to the existing sidecar.

The parser recognizes a plain route comment as the description plus `@summary`, `@description`, `@remarks`, repeated `@tag`, and `@deprecated`. Explicit sidecar fields win. Docstrings do not provide response descriptions, parameter schemas, examples, or operation IDs, and the source must contain a statically discoverable `defineContract()` route tree.

## Keep serving and policy outside generation

`@hulla/api-openapi` creates the JSON or YAML artifact. The application or deployment platform still owns:

- serving the document over HTTP;
- mounting Swagger UI, Scalar, Redoc, or another interface;
- enforcing authentication and authorization described by OpenAPI `security` metadata;
- publishing and deploying the generated file.

For the opposite source-of-truth direction, continue to [importing OpenAPI](./openapi-import.md). To implement and mount the runtime contract, continue to [server implementations](./server-authoring.md), then choose the host-specific server or runtime guide.
