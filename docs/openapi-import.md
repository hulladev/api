# Import an OpenAPI document

Generate an `@hulla/api` contract from an existing OpenAPI document. The command writes the contract and Zod schemas to `src/api.generated.ts`, with descriptions in `src/api.generated.openapi.ts`.

When the API changes, update the OpenAPI document and run the command again.

## Install the generator

The default generator writes Zod schemas, so install Zod with `@hulla/api` and the OpenAPI package.

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

## Start with a bundled OpenAPI document

Save this provider-owned description as `openapi.yaml`:

```yaml
openapi: 3.1.2
info:
  title: Pets API
  version: 1.0.0
paths:
  /pets/{id}:
    get:
      operationId: getPet
      parameters:
        - name: id
          in: path
          required: true
          description: Pet identifier
          schema:
            type: string
      responses:
        "200":
          description: Pet found
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/Pet"
        "404":
          description: Pet not found
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/Problem"
components:
  schemas:
    Pet:
      type: object
      additionalProperties: false
      required: [id, name]
      properties:
        id: { type: string }
        name: { type: string }
    Problem:
      type: object
      additionalProperties: false
      required: [message]
      properties:
        message: { type: string }
```

Bundle external references before importing. The importer resolves references inside the document, primarily `#/components/schemas/...`; it does not fetch remote files or URLs.

## Generate the contract and sidecar

> [!WARNING]
> **Import replaces both generated files**
>
> The import command overwrites both targets without prompting. Do not put application code or manual corrections in them.

Run the import from the project root:

```sh
hulla-openapi import ./openapi.yaml \
  --contract ./src/api.generated.ts \
  --openapi ./src/api.generated.openapi.ts
```

The command creates parent directories and replaces both targets. `{id}` becomes the contract path parameter `:id`, and `operationId: getPet` becomes the route key `getPet`.

The generated runtime contract has this shape, formatted here for readability:

```ts
import { defineContract, response, route } from "@hulla/api";
import { z } from "zod";

const PetSchema = z
  .object({
    id: z.string(),
    name: z.string(),
  })
  .strict();

const ProblemSchema = z
  .object({
    message: z.string(),
  })
  .strict();

export const contract = defineContract({
  routes: {
    getPet: route.get("/pets/:id", {
      params: z.object({ id: z.string() }),
      responses: {
        200: response.json(PetSchema, { contentType: "application/json" }),
        404: response.json(ProblemSchema, { contentType: "application/json" }),
      },
    }),
  },
});
```

The generated sidecar preserves the OpenAPI descriptions separately from runtime behavior. The actual file also retains the top-level `components` object from the source document.

```ts
import { defineOpenAPI } from "@hulla/api-openapi";
import { contract } from "./api.generated";

export default defineOpenAPI(contract, {
  openapi: "3.1.2",
  info: { title: "Pets API", version: "1.0.0" },
  routes: {
    getPet: {
      operationId: "getPet",
      request: {
        path: { id: { description: "Pet identifier" } },
      },
      responses: {
        200: { description: "Pet found" },
        404: { description: "Pet not found" },
      },
    },
  },
});
```

The application imports `contract` from `api.generated.ts`. The sidecar is used by OpenAPI generation and does not create a second client runtime.

## Call the generated route

Use the generated contract with the same client and transport APIs as a hand-written contract:

```ts
import { createClient } from "@hulla/api/client";
import { fetchTransport } from "@hulla/api/fetch";
import { contract } from "./api.generated";

const client = createClient(contract, {
  transport: fetchTransport({
    baseUrl: "https://api.example.com",
  }),
});

const result = await client.getPet({
  params: { id: "pet-123" },
});

if (result.status === 200) {
  console.log(result.body.name);
} else {
  console.error(result.body.message);
}
```

Declared `4xx` and `5xx` responses remain status-discriminated data. Network failures, malformed JSON, content-type mismatches, statuses absent from the contract, and codec decoding failures reject the client call. Ordinary response schemas describe types but are not re-run by the client against otherwise valid JSON.

## Detect generated-file drift

Commit both generated files when the application relies on them, then check them in CI:

```sh
hulla-openapi check ./openapi.yaml \
  --contract ./src/api.generated.ts \
  --openapi ./src/api.generated.openapi.ts
```

`check` regenerates both files in memory and compares their exact contents. It exits unsuccessfully when either file is missing or differs, and it does not modify the files.

The comparison is byte-for-byte. Exclude these generated files from formatters, or run `hulla-openapi import` after formatting, so a formatting-only rewrite does not fail the drift check.

## Review the conversion boundaries

The default `zodSchemaCodeGenerator()` converts the HTTP wire schema, not application-side codecs or their encode/decode functions.

| OpenAPI feature                                   | Import behavior                                                                                                                  |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Bundled local schema references                   | `#/components/schemas/...` references are generated in dependency order; external references must be bundled first               |
| JSON, text, and `application/octet-stream` bodies | Generated as `request` or `response` helpers for the selected representation                                                     |
| Multiple media types                              | One representation is selected, preferring JSON, text, bytes, then multipart, then the first entry; generation records a warning |
| Optional request body                             | Generated as a required `@hulla/api` body with a warning                                                                         |
| Multipart request                                 | Generated as `request.formData()` without typed field validation                                                                 |
| Multipart response or a `GET` request body        | Rejected                                                                                                                         |
| Cookie parameters or parameter `content`          | Rejected                                                                                                                         |
| Query serialization                               | Omitted style or `style: form` is accepted; `explode: false` and `allowReserved: true` are rejected                              |
| Path and header serialization                     | Omitted style or `style: simple` is accepted; array wire values are rejected                                                     |
| Array-valued response headers                     | Rejected                                                                                                                         |
| `HEAD`, `OPTIONS`, `TRACE`, callbacks             | Rejected because `@hulla/api` route declarations cannot represent them                                                           |
| Webhooks and operation-specific servers           | Dropped with warnings                                                                                                            |
| `default` or ranged responses such as `2XX`       | Rejected; declare concrete three-digit statuses                                                                                  |

The default generator covers JSON objects, arrays, strings, numbers, integers, booleans, `null`, enums, constants, unions, intersections, nullability, common string formats, bounds, `required`, and `additionalProperties`. Less common constraints such as `minItems`, `maxItems`, `multipleOf`, `patternProperties`, `$defs`, and `unevaluatedProperties` are not preserved by the default generator. Inspect the generated code when the source document depends on those keywords.

Component names must produce unique TypeScript identifiers. Generation rejects names that begin with a number and collisions such as `User-ID` and `User_ID`; rename the components and their references before importing.

OpenAPI 3.0 input produces a warning and a generated 3.1.2 sidecar. Only an input whose version is exactly 3.2.0 keeps 3.2.0. If a document uses the `query` operation, make the source OpenAPI 3.2.0 so the generated sidecar can be exported again; OpenAPI 3.1 cannot represent HTTP `QUERY`.

## Inspect generation programmatically

Use the public functions when a build tool needs generated strings or must inspect non-fatal diagnostics:

```ts
import {
  generateContractFromOpenAPI,
  readOpenAPIDocument,
  writeGeneratedOpenAPIContract,
} from "@hulla/api-openapi";

const document = await readOpenAPIDocument("./openapi.yaml");
const generated = generateContractFromOpenAPI(document, {
  contractImport: "./api.generated",
});

for (const diagnostic of generated.diagnostics) {
  console.warn(diagnostic.location, diagnostic.message);
}

await writeGeneratedOpenAPIContract(generated, {
  contract: "./src/api.generated.ts",
  openapi: "./src/api.generated.openapi.ts",
});
```

`generateContractFromOpenAPI()` throws `OpenAPIImportError` when structured diagnostics include an error. Some malformed documents and unresolved references can also throw ordinary errors. The CLI stops on errors but does not print non-fatal warnings; use the programmatic `diagnostics` array when warnings must be reviewed or enforced.

The optional `schemaGenerator` setting accepts an `OpenAPISchemaCodeGenerator` implementation when the generated contract must use another schema library or mapping. That implementation owns imports, component declarations, schema conversion, and object generation.

For the code-first direction, continue to [exporting a contract](./openapi-export.md). For client error behavior, see [errors](./errors.md).
