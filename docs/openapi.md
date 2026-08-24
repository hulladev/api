# OpenAPI generation

`@hulla/api-openapi` keeps documentation outside the runtime contract. A typical code-first API has two modules:

```ts
// api.ts
import { defineContract, response, route } from '@hulla/api'
import { z } from 'zod'

export const contract = defineContract({
  routes: {
    /**
     * Returns a user by identifier.
     *
     * @summary Get a user
     * @tag Users
     */
    getUser: route.get('/users/:id', {
      params: z.object({ id: z.string().uuid() }),
      responses: {
        200: response.json(z.object({ id: z.string(), name: z.string() })),
        404: response.json(z.object({ message: z.string() })),
      },
    }),
  },
})
```

```ts
// api.openapi.ts
import { defineOpenAPI } from '@hulla/api-openapi'
import { contract } from './api'

export default defineOpenAPI(contract, {
  info: { title: 'Users API', version: '1.0.0' },
  docstrings: { source: new URL('./api.ts', import.meta.url) },
  routes: {
    getUser: {
      request: {
        path: { id: { description: 'User identifier' } },
      },
      responses: {
        200: { description: 'The requested user' },
        404: { description: 'No user has that identifier' },
      },
    },
  },
})
```

The documentation tree mirrors the contract. Every route must be documented or explicitly excluded with
`{ include: false, reason: '…' }`, and every declared route or contract-error response needs a description. Direct
object literals reject unknown keys during type checking; generation performs the same recursive validation at runtime
so documentation stored in intermediate variables cannot silently drift.

Docstrings are build-time fallback values for `summary`, `description`, `tags`, and `deprecated`. Explicit sidecar
values win. The parser supports direct route declarations and local route variables in the contract module. It fails
with a source location when composition prevents it from finding a requested route. Docstrings are not attached to
clients, server bindings, or the runtime contract.

## Contract to OpenAPI

```ts
import definition from './api.openapi'
import { createOpenAPIDocument, writeOpenAPIDocument } from '@hulla/api-openapi'

await writeOpenAPIDocument('./openapi.json', await createOpenAPIDocument(definition))
```

The exporter defaults to OpenAPI 3.1.2 and uses Standard JSON Schema's input conversion because OpenAPI describes the
HTTP representation. Hulla codecs retain their wire schema's conversion capability. JSON and YAML output are both
supported. A schema without Standard JSON Schema support produces an exact generation error unless the sidecar supplies
an explicit request or response `schema` override.

```sh
hulla-openapi export ./src/api.openapi.ts --output ./openapi.yaml
```

HTTP `QUERY` requires OpenAPI 3.2.0. Raw, streamed, and otherwise non-structural response representations require an
explicit schema for the complete response. Generated documents can be consumed by Swagger UI, Scalar, Redoc, or any
other ordinary OpenAPI tooling.

## OpenAPI to contract

```ts
import {
  generateContractFromOpenAPI,
  readOpenAPIDocument,
  writeGeneratedOpenAPIContract,
} from '@hulla/api-openapi'

const generated = generateContractFromOpenAPI(await readOpenAPIDocument('./openapi.yaml'))
await writeGeneratedOpenAPIContract(generated, {
  contract: './src/api.generated.ts',
  openapi: './src/api.generated.openapi.ts',
})
```

The reverse generator writes a normal Hulla runtime contract and a separate typed sidecar. Zod is the default schema
code generator; `schemaGenerator` is pluggable so the import pipeline is not architecturally tied to it. Local component
references, request parameters and bodies, all concrete response statuses, descriptions, examples, and common JSON
Schema forms are supported.

```sh
hulla-openapi import ./openapi.yaml \
  --contract ./src/api.generated.ts \
  --openapi ./src/api.generated.openapi.ts

hulla-openapi check ./openapi.yaml \
  --contract ./src/api.generated.ts \
  --openapi ./src/api.generated.openapi.ts
```

`check` regenerates in memory and fails when committed generated files differ. Unsupported or lossy semantics produce
structured diagnostics; generation stops on errors instead of emitting permissive placeholder schemas. OpenAPI cannot
reconstruct application-side Hulla codecs, so imported schemas describe the wire contract.
