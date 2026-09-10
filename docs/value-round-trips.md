# Values across HTTP boundaries

Use ordinary schemas by default for validated contracts. Use codecs when the client and handler should share richer application values. Type-only JSON declarations skip runtime shape checks.

HTTP transports bytes. Native JSON serialization and parsing preserve numbers, booleans, arrays, plain objects, and null. They do not reconstruct dates. Path, query, and header values are textual: `?quantity=2` parses as string `"2"`, whereas JSON `{"quantity":2}` parses as number `2`.

## Native JSON

```ts
const contract = defineContract({
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

const implementation = defineServer(contract).implement({
  double: ({ body }) => ({ status: 200, body: { doubled: body.quantity * 2 } }),
  tomorrow: ({ body }) => ({
    status: 200,
    body: { at: new Date(new Date(body.at).getTime() + 86_400_000).toISOString() },
  }),
})
```

The numeric request is `{ quantity: 2 }` in client code, `{"quantity":2}` in the HTTP body, and `{ quantity: 2 }` in the handler. The response takes the same path with `{ doubled: 4 }`. All application numbers remain numbers through native JSON parsing.

The date request and response contain ISO strings. The handler explicitly converts a string to a Date and back. Our package performs no shape validation. A generic does not prevent an external caller from sending the wrong shape.

## Ordinary schemas

Replace the native declarations above with these schemas; handlers and client values stay the same:

```ts
// double
body: request.json(z.object({ quantity: z.number().int() }))
responses: { 200: response.json(z.object({ doubled: z.number().int() })) }

// tomorrow
body: request.json(z.object({ at: z.iso.datetime() }))
responses: { 200: response.json(z.object({ at: z.iso.datetime() })) }
```

The server validates the parsed request before invoking the handler. It validates the handler's response before serialization and sends the schema output. A datetime string validator does not create a Date. The client trusts ordinary response output without repeating validation; status, content type, and transport parsing still apply.

## Transforms

```ts
const contract = defineContract({
  routes: {
    double: route.post('/double', {
      body: request.json(z.object({ quantity: z.string().regex(/^\d+$/).transform(Number) })),
      responses: { 200: response.json(z.object({ doubled: z.number().transform(String) })) },
    }),
    tomorrow: route.post('/tomorrow', {
      body: request.json(z.object({ at: z.iso.datetime().transform(value => new Date(value)) })),
      responses: { 200: response.json(z.object({ at: z.date().transform(value => value.toISOString()) })) },
    }),
  },
})

const implementation = defineServer(contract).implement({
  double: ({ body }) => ({
    // body.quantity: number = 2
    status: 200,
    body: { doubled: body.quantity * 2 }, // number = 4
  }),
  tomorrow: ({ body }) => ({
    // body.at: Date
    status: 200,
    body: { at: new Date(body.at.getTime() + 86_400_000) }, // Date
  }),
})

const numeric = await client.double({ body: { quantity: '2' } })
// numeric.body.doubled: string = "4"
const dated = await client.tomorrow({ body: { at: '2026-09-09T12:00:00.000Z' } })
// dated.body.at: string = "2026-09-10T12:00:00.000Z"
```

Our package invokes the request transform after JSON parsing on the server, and the response transform before JSON serialization on the server. JSON transports the resulting values. The client never reruns an ordinary transform.

| Endpoint | Client request | Handler input | Handler return body | Client response body |
| --- | --- | --- | --- | --- |
| double | `{ quantity: "2" }` | `{ quantity: 2 }` | `{ doubled: 4 }` | `{ doubled: "4" }` |
| tomorrow | `{ at: ISO string }` | `{ at: Date }` | `{ at: Date }` | `{ at: ISO string }` |

## Codecs

```ts
const dated = codec(
  z.object({ at: z.iso.datetime() }), // Wire
  z.object({ at: z.date() }),         // Application
  {
    encode: ({ at }) => ({ at: at.toISOString() }),
    decode: ({ at }) => ({ at: new Date(at) }),
  },
)

const contract = defineContract({ routes: {
  tomorrow: route.post('/tomorrow', {
    body: request.json(dated),
    responses: { 200: response.json(dated) },
  }),
} })
const implementation = defineServer(contract).implement({
  tomorrow: ({ body }) => ({
    status: 200,
    body: { at: new Date(body.at.getTime() + 86_400_000) },
  }),
})
const result = await client.tomorrow({ body: { at: new Date('2026-09-09T12:00:00.000Z') } })
// result.body.at: Date = new Date('2026-09-10T12:00:00.000Z')
```

The complete sequence is:

1. Client Date → our codec encode → ISO string.
2. Native JSON serialization → HTTP bytes → native JSON parsing on server.
3. ISO string → our codec decode → handler Date.
4. Handler returns Date → our codec encode → ISO string.
5. Native JSON serialization → HTTP bytes → native JSON parsing on client.
6. ISO string → our codec decode → client Date.

Encode validates the application value and resulting wire value. Decode validates the wire value and resulting application value. JSON numbers do not need codecs; a codec can nevertheless deliberately map numbers to textual wire values using `String` and `Number`.

Response headers, formatted stream items, and declared error data follow the same ordinary-schema versus codec rule. In-process transport retains these boundary operations but bypasses native HTTP/JSON serialization; it does not simulate JSON's omission of undefined fields or other native serialization behavior.
