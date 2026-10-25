# Values across HTTP boundaries

JSON has no `Date` type. If a handler returns a date, the client normally receives a string. A codec lets you choose to receive a `Date` instead.

Start with ordinary JSON, then add validation or conversion when the values in your application need it. The examples below make that change one step at a time.

```ts
import { codec, defineContract, request, response, route } from '@hulla/api'
import { createClient } from '@hulla/api/client'
import { fetchAdapter, fetchTransport } from '@hulla/api/fetch'
import { defineServer } from '@hulla/api/server'
import { z } from 'zod'
```

## Type-only JSON

Type-only declarations provide TypeScript types and native JSON parsing.

> [!WARNING] Types do not check incoming data
> A generic type disappears at runtime. Pass a schema when a request can contain untrusted input.

```ts
const nativeContract = defineContract({
  routes: {
    double: route.post('/double', {
      body: request.json<{ quantity: number }>(),
      responses: { 200: response.json<{ doubled: number }>() },
    }),
    tomorrow: route.post('/tomorrow', {
      body: request.json<{ at: string }>(),
      responses: { 200: response.json<{ at: string }>() },
    }),
  },
})

const nativeImplementation = defineServer(nativeContract).implement({
  double: ({ body }) => ({
    status: 200,
    body: { doubled: body.quantity * 2 },
  }),
  tomorrow: ({ body }) => ({
    status: 200,
    body: {
      at: new Date(new Date(body.at).getTime() + 86_400_000).toISOString(),
    },
  }),
})

const nativeClient = createClient(nativeContract, {
  transport: fetchTransport({
    baseUrl: 'https://values.test',
    fetch: fetchAdapter().mount(nativeImplementation),
  }),
})

const numeric = await nativeClient.double({ body: { quantity: 2 } })
console.log(numeric.body) // { doubled: 4 }

const nativeDateResult = await nativeClient.tomorrow({
  body: { at: '2026-09-09T12:00:00.000Z' },
})
console.log(nativeDateResult.body) // { at: '2026-09-10T12:00:00.000Z' }
```

The number remains a number on both sides because JSON has a native numeric representation. The date
remains an ISO string; the handler must explicitly construct a `Date` if its application logic needs
one. A type argument does not prevent an external caller from sending the wrong JSON shape.

## Ordinary schemas

An ordinary schema validates the decoded request before the handler runs and validates or transforms
the handler's response before serialization. This variant keeps the values JSON-shaped while adding
runtime checks:

```ts
const schemaContract = defineContract({
  routes: {
    double: route.post('/double', {
      body: request.json(z.object({ quantity: z.number().int() })),
      responses: {
        200: response.json(z.object({ doubled: z.number().int() })),
      },
    }),
    tomorrow: route.post('/tomorrow', {
      body: request.json(z.object({ at: z.iso.datetime() })),
      responses: {
        200: response.json(z.object({ at: z.iso.datetime() })),
      },
    }),
  },
})

const schemaImplementation = defineServer(schemaContract).implement({
  double: ({ body }) => ({
    status: 200,
    body: { doubled: body.quantity * 2 },
  }),
  tomorrow: ({ body }) => ({
    status: 200,
    body: {
      at: new Date(new Date(body.at).getTime() + 86_400_000).toISOString(),
    },
  }),
})

const schemaClient = createClient(schemaContract, {
  transport: fetchTransport({
    baseUrl: 'https://values.test',
    fetch: fetchAdapter().mount(schemaImplementation),
  }),
})

const checked = await schemaClient.double({ body: { quantity: 2 } })
console.log(checked.body) // { doubled: 4 }
```

The `z.iso.datetime()` schema checks the string format; it does not create a `Date`. If the handler
should receive a `Date`, use a directional transform or a codec depending on what the client should
receive.

## Directional transforms

An ordinary schema can transform in its validation direction. The request transform below accepts a
numeric string from the client and gives the handler a number. The response transform accepts a number
from the handler and gives the client a string:

```ts
const transformedContract = defineContract({
  routes: {
    double: route.post('/double', {
      body: request.json(
        z.object({ quantity: z.string().regex(/^\d+$/).transform(Number) }),
      ),
      responses: {
        200: response.json(
          z.object({ doubled: z.number().int().transform(String) }),
        ),
      },
    }),
    tomorrow: route.post('/tomorrow', {
      body: request.json(
        z.object({
          at: z.iso.datetime().transform((value) => new Date(value)),
        }),
      ),
      responses: {
        200: response.json(
          z.object({ at: z.date().transform((value) => value.toISOString()) }),
        ),
      },
    }),
  },
})

const transformedImplementation = defineServer(transformedContract).implement({
  double: ({ body }) => ({
    status: 200,
    body: { doubled: body.quantity * 2 },
  }),
  tomorrow: ({ body }) => ({
    status: 200,
    body: { at: new Date(body.at.getTime() + 86_400_000) },
  }),
})

const transformedClient = createClient(transformedContract, {
  transport: fetchTransport({
    baseUrl: 'https://values.test',
    fetch: fetchAdapter().mount(transformedImplementation),
  }),
})

const transformedNumber = await transformedClient.double({
  body: { quantity: '2' },
})
console.log(transformedNumber.body) // { doubled: '4' }

const transformedDate = await transformedClient.tomorrow({
  body: { at: '2026-09-09T12:00:00.000Z' },
})
console.log(transformedDate.body) // { at: '2026-09-10T12:00:00.000Z' }
```

The request transform runs after JSON parsing on the server. The response transform runs before JSON
serialization on the server. The client receives the transformed response and does not rerun the
ordinary response schema.

| Endpoint   | Client request       | Handler input     | Handler return body | Client response body |
| ---------- | -------------------- | ----------------- | ------------------- | -------------------- |
| `double`   | `{ quantity: '2' }`  | `{ quantity: 2 }` | `{ doubled: 4 }`    | `{ doubled: '4' }`   |
| `tomorrow` | `{ at: ISO string }` | `{ at: Date }`    | `{ at: Date }`      | `{ at: ISO string }` |

## Codecs

Use `codec()` when both sides should use an application value that differs from its wire
representation. The wire schema and application schema must describe the values before and after the
codec functions:

```ts
const dateCodec = codec(
  z.object({ at: z.iso.datetime() }),
  z.object({ at: z.date() }),
  {
    encode: ({ at }) => ({ at: at.toISOString() }),
    decode: ({ at }) => ({ at: new Date(at) }),
  },
)

const codecContract = defineContract({
  routes: {
    tomorrow: route.post('/tomorrow', {
      body: request.json(dateCodec),
      responses: { 200: response.json(dateCodec) },
    }),
  },
})

const codecImplementation = defineServer(codecContract).implement({
  tomorrow: ({ body }) => ({
    status: 200,
    body: { at: new Date(body.at.getTime() + 86_400_000) },
  }),
})

const codecClient = createClient(codecContract, {
  transport: fetchTransport({
    baseUrl: 'https://values.test',
    fetch: fetchAdapter().mount(codecImplementation),
  }),
})

const result = await codecClient.tomorrow({
  body: { at: new Date('2026-09-09T12:00:00.000Z') },
})
console.log(result.body.at) // 2026-09-10T12:00:00.000Z as a Date
```

The complete codec sequence is:

1. The client `Date` is encoded to an ISO string.
2. Native JSON serialization sends that string as HTTP bytes.
3. The server decodes the string to the handler's `Date`.
4. The handler returns a `Date`, which the codec encodes to an ISO string.
5. Native JSON serialization sends the response string back to the client.
6. The client decodes the string back to a `Date`.

Encode validates the application value and its wire output. Decode validates the wire value and its
application output. JSON numbers do not need codecs; use one only when the application and wire
representations should intentionally differ. The same ordinary-schema-versus-codec rule applies to
response headers, formatted stream items, and declared error data. In-process transport preserves
these validation and codec steps but skips native HTTP/JSON serialization.
