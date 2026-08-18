# Request transport

@hulla/api treats an ordinary request schema directionally: its input is supplied to the client and its validated output is exposed to server code. Use an explicit codec when client and server should instead share one application representation.

## URL and header values

Path parameters, query fields, and headers cross HTTP as text. Their wire schemas must therefore accept strings; query arrays and tuples accept repeated strings. A one-way schema transform keeps the client textual while giving the handler a richer value:

```ts
import { z } from 'zod'

const oneWayQuery = z.object({
  page: z.string().regex(/^\d+$/).transform(Number),
})
```

With this declaration the client supplies `{ page: string }` and the handler receives `{ page: number }`.

Use `codec()` when both applications should use the richer representation:

```ts
import { codec, defineContract, response, route } from '@hulla/api'
import { z } from 'zod'

const sharedQuery = codec(
  z.object({
    page: z.string().regex(/^\d+$/),
    active: z.enum(['true', 'false']),
    tags: z.array(z.string()).optional(),
  }),
  z.object({
    page: z.number().int(),
    active: z.boolean(),
    tags: z.array(z.string()).optional(),
  }),
  {
    decode: ({ page, active, tags }) => ({ page: Number(page), active: active === 'true', tags }),
    encode: ({ page, active, tags }) => ({
      page: String(page),
      active: active ? 'true' : 'false',
      tags,
    }),
  },
)

const contract = defineContract({
  routes: {
    search: route.get('/search', {
      query: sharedQuery,
      responses: { 200: response.empty() },
    }),
  },
})
```

Here the client and handler both use `{ page: number; active: boolean; tags?: string[] }`. The codec alone converts that application value to and from the textual HTTP representation.

Plain `z.number()` and `z.boolean()` are invalid query, path, and header wire schemas because HTTP delivers those values as text. Values are not implicitly stringified. Use a textual one-way transform when the client should remain wire-shaped, or a codec when both applications should use the richer type.

Codec endpoint schemas describe stable representations. Type-changing transforms and coercions belong in `decode` and `encode`; same-type normalization such as trimming remains valid when it is safe to apply repeatedly.

## Query values

Query transport is intentionally flat. Scalars use one key and arrays or tuples repeat the key:

```text
?search=Ada&tags=admin&tags=author
```

On input, one occurrence is passed to the schema as a string and repeated occurrences are passed as a string array. The schema owns singleton-versus-array normalization when both forms are valid. `undefined` fields are omitted and explicit empty arrays are rejected. An absent field may still become `[]` when the schema declares a default.

Nested objects and nested arrays are rejected. There is no built-in bracket parser or JSON query mode: those formats introduce transport policy, ambiguity, and parser-safety concerns that are better kept out of the default contract model.

## Request bodies

A naked body schema is JSON shorthand. JSON bodies retain their natural JSON types:

```ts
body: z.object({
  title: z.string(),
  count: z.number().int(),
  active: z.boolean(),
})
```

A codec is needed when JSON cannot directly represent the application value, or when client and server should share a transformed value:

```ts
const datedBody = codec(
  z.object({ createdAt: z.iso.datetime() }),
  z.object({ createdAt: z.date() }),
  {
    decode: ({ createdAt }) => ({ createdAt: new Date(createdAt) }),
    encode: ({ createdAt }) => ({ createdAt: createdAt.toISOString() }),
  },
)
```

Explicit representations use the request namespace:

```ts
body: request.json(schema)
body: request.text(schema)
body: request.bytes(schema)
body: request.formData(schema)
```

Each helper also has a representation-appropriate identity schema when the schema is omitted. Content types match by MIME essence, so parameters such as JSON charsets and multipart boundaries do not change the selected representation.

## Adapter boundary

Adapters provide a standard `Request`, then extract raw path strings, flat query parameters, headers, and the selected body representation. Repeated query keys become arrays before Standard Schema validation. Codecs are compiled into the shared client/server route plan, so framework adapters do not implement validator-specific encoding.
