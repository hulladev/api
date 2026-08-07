# Request transport

Hulla treats every request schema directionally: schema input is the HTTP wire value and schema output is the value exposed to application code.

## Text-first URL values

Path parameters, headers, and query values arrive as text. Keep values as strings with normal Zod schemas, or use the optional Zod integration when the application needs a richer value:

```ts
import { z } from 'zod'
import { text } from '@hulla/api/zod'

const query = z.object({
  search: z.string().optional(),
  page: text.integer().optional(),
  active: text.boolean().optional(),
  cursor: text.bigint().optional(),
  since: text.datetime().optional(),
  tags: z.array(z.string()).min(1).optional(),
})
```

`text.*` values are native Zod codecs. Their input is text and their output is the handler value. Custom conversions use `z.codec()` directly.

Using `z.number()` or `z.boolean()` directly in params, headers, or query fields is a type error because those schemas expect a non-text wire value. They remain appropriate for JSON bodies.

## Query cardinality

Zod query arrays and tuples use repeated keys:

```text
?tags=admin&tags=author&coordinate=50.08&coordinate=14.43
```

A scalar may occur once. Arrays and tuples may occur one or more times, preserving order. Empty arrays have no query-string representation: the client encoder rejects them, while an absent defaulted schema may still produce `[]` during decoding.

Standard Schema does not expose runtime structure. Other validators therefore declare repeated keys explicitly:

```ts
query: request.query(
  v.object({
    search: v.optional(v.string()),
    tags: v.array(v.string()),
  }),
  { repeated: ['tags'] },
)
```

The repeated list is checked against the schema input type and compiled into frozen route metadata. Runtime parsing never probes a schema with candidate values.

## Built-in text codecs

The focused initial catalog is:

- `text.integer()` for strict safe base-10 integers;
- `text.number()` for finite JSON-number text;
- `text.bigint()` for arbitrary base-10 integers;
- `text.boolean()` for exact `true` and `false` text;
- `text.datetime()` for offset-qualified ISO instants represented as `Date`;
- `text.json(schema)` for a structured value stored in one textual field.

Values that remain text continue to use Zod directly, including UUIDs, email addresses, URLs, ISO calendar dates, durations, and enums.

## Request bodies

A naked body schema is JSON shorthand:

```ts
body: z.object({
  title: z.string(),
  createdAt: text.datetime(),
})
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

Adapters extract raw text occurrences, headers, path values, and the selected raw body representation. They must not perform numeric, boolean, date, JSON, or collection coercion. Query and body transport helpers in core perform normalization before Standard Schema validation runs once.
