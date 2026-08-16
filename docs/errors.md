# Error model

@hulla/api operational errors use one structural interface:

```ts
type APIError = Error & {
  readonly code: string
  readonly issues: readonly APIErrorIssue[]
}

type APIErrorIssue = {
  readonly message: string
  readonly path?: readonly (PropertyKey | { readonly key: PropertyKey })[]
  readonly code?: unknown // vendor-defined; @hulla/api-created issue codes are strings
  readonly location?: 'body' | 'headers' | 'input' | 'output' | 'params' | 'query' | 'response'
}
```

`APIErrorIssue` extends the Standard Schema issue shape. Validator messages, paths, and vendor metadata therefore flow through @hulla/api without translation, with boundary metadata added when core knows where validation occurred. Applications do not need a separate validation-error representation.

The error `code` identifies the broad failure. An issue `code` identifies a specific leaf failure and may come from the schema vendor. For example, a Zod response failure has the error code `schema-validation`, issue location `response`, and may retain an issue code such as `invalid_type`.

## Narrowing unknown failures

Use the structural guard rather than relying on `instanceof` across package or JavaScript realm boundaries:

```ts
import { isAPIError } from '@hulla/api/errors'

try {
  await operation()
} catch (error) {
  if (!isAPIError(error)) throw error

  console.error(error.code)
  for (const issue of error.issues) {
    console.error(issue.location, issue.path, issue.message)
  }
}
```

Application and plugin errors can participate in the same convention by exposing an error name, message, string code, and issue array. `annotateAPIErrorIssues()` copies and freezes Standard Schema-compatible issues while adding default code or location metadata.

## Core errors

| Error | Error codes | Additional navigation |
| --- | --- | --- |
| `SchemaValidationError` | `schema-validation` | optional boundary `location`; validator paths and codes |
| `ContractError` | `schema-validation` | required HTTP contract `location` |
| `QueryTransportError` | query transport code | `key` and a query-located issue |
| `ClientResponseError` | client response code | original `Response` and a response-located issue |
| `ServerImplementationError` | server implementation code | `handlerKeys` and one issue per affected handler |
| `ServerRuntimeError` | server request/runtime code | HTTP `status` plus an optional boundary location |

Invalid authoring arguments remain ordinary `TypeError` values. The structured interface is for failures that integrations and application error policies need to inspect programmatically.

## Protocol problems

`toAPIProblem()` converts any `APIError` into the JSON-safe `APIProblem` representation. It normalizes Standard Schema path segments and symbols while preserving error codes, issue codes, and locations:

```ts
import { isAPIError, toAPIProblem } from '@hulla/api/errors'

if (isAPIError(error)) {
  const problem = toAPIProblem(error, {
    status: 400,
    title: 'Invalid request',
  })
}
```

Server execution and adapters can use this conversion without defining a second issue format.
