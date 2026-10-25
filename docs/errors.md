# Error model

A missing user and a broken connection need different handling. Declare expected failures, such as `NOT_FOUND`, in the contract so callers can handle them by name. Unexpected failures reject the call; use [`isAPIError()`](#operational-errors) to inspect errors reported by the API runtime.

## Declared application errors

`defineErrors()` defines a named group without assigning transport status:

```ts
import { defineContract, defineErrors, response, route } from '@hulla/api'
import { z } from 'zod'

export const errors = defineErrors({
  UNAUTHORIZED: {
    message: 'Authentication required',
  },
  ITEM_NOT_FOUND: {
    message: 'Item not found',
    data: z.object({ id: z.string() }),
  },
  ORGANIZATION_NOT_FOUND: {
    message: 'Organization not found',
  },
})

export const contract = defineContract({
  errors: {
    401: errors.UNAUTHORIZED,
    404: [errors.ITEM_NOT_FOUND, errors.ORGANIZATION_NOT_FOUND],
  },
  routes: {
    user: route.get('/users/:id', {
      params: z.object({ id: z.string().min(1) }),
      responses: {
        200: response.json(z.object({ id: z.string(), name: z.string() })),
      },
    }),
  },
})
```

Each member is an independent callable declaration. Calling it creates a fresh `DeclaredError`; its default message can be overridden per occurrence:

```ts
const unauthorized = errors.UNAUTHORIZED({ message: 'Your session expired' })
const missing = errors.ITEM_NOT_FOUND({ data: { id: 'item-1' } })

console.log(unauthorized.code, unauthorized.message)
console.log(missing.code, missing.data.id)
```

`message` is optional in the declaration; when omitted, the error code is the default. There is no separate `title` field in the application-error wire shape.

Both forms produce the same concise JSON body once the declaration crosses an HTTP contract boundary:

```json
{
  "code": "ITEM_NOT_FOUND",
  "message": "Item not found",
  "data": { "id": "item-1" }
}
```

Returning a declaration from a handler and throwing one are both supported. The adapter serializes either form using the status and declaration from the contract:

```ts
import { defineServer } from '@hulla/api/server'

export const implementation = defineServer(contract).implement({
  user: ({ params, errors, response }) => {
    if (params.id === 'ada') return response(200, { id: 'ada', name: 'Ada' })

    const failure = errors.ITEM_NOT_FOUND({ data: { id: params.id } })
    if (params.id === 'throw') throw failure
    return failure
  },
})
```

The declaration key supplies the stable code, so users do not repeat it in a literal schema. Only variable `data` needs a Standard Schema. A status accepts a single declaration directly; use an array only when several distinct errors share that status:

```ts
errors: {
  404: [errors.ITEM_NOT_FOUND, errors.ORGANIZATION_NOT_FOUND],
}
```

One declaration cannot be assigned to several statuses in the same contract.

Clients return declared errors as typed response values by default. The following client call prints the successful name and then the typed error data:

```ts
import { createClient } from '@hulla/api/client'
import { inProcessTransport } from '@hulla/api/in-process'

const client = createClient(contract, {
  transport: inProcessTransport(implementation),
})

const found = await client.user({ params: { id: 'ada' } })
if (found.status === 200) console.log(found.body.name) // Ada

const missing = await client.user({ params: { id: 'item-1' } })
if (missing.status === 404 && missing.body.code === 'ITEM_NOT_FOUND') {
  console.log(missing.body.data.id) // item-1
}
```

Applications that prefer exception control flow can opt in once when defining the client. The server's declared response is decoded as a `DeclaredError` and rejected from the call:

```ts
import { isDeclaredError } from '@hulla/api'

const throwingClient = createClient(contract, {
  transport: inProcessTransport(implementation),
  errorMode: 'throw',
})

try {
  await throwingClient.user({ params: { id: 'item-1' } })
} catch (error) {
  if (!isDeclaredError(error)) throw error
  console.log(error.code, error.message, error.data) // ITEM_NOT_FOUND Item not found { id: 'item-1' }
}
```

In `throw` mode, a declared failure is reconstructed as a `DeclaredError`; successful route return types no longer include the declared error response union.

## Operational errors

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
  readonly location?:
    'body' | 'headers' | 'input' | 'output' | 'params' | 'query' | 'response'
}
```

`APIErrorIssue` extends the Standard Schema issue shape. Validator messages, paths, and vendor metadata therefore flow through @hulla/api without translation, with boundary metadata added when core knows where validation occurred. Applications do not need a separate validation-error representation.

The error `code` identifies the broad failure. An issue `code` identifies a specific leaf failure and may come from the schema vendor. For example, a Zod response failure has the error code `schema-validation`, issue location `response`, and may retain an issue code such as `invalid_type`.

## Narrowing unknown failures

Use the structural guard rather than relying on `instanceof` across package or JavaScript realm boundaries. This example defines an application integration failure that follows the same shape:

```ts
import { isAPIError } from '@hulla/api/errors'

async function operation(): Promise<void> {
  throw Object.assign(new Error('Database unavailable'), {
    code: 'database.unavailable',
    issues: [{ message: 'Database unavailable', location: 'input' }],
  })
}

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

Application and integration errors can participate in the same convention by exposing an error name, message, string code, and issue array. `annotateAPIErrorIssues()` copies Standard Schema-compatible issues while adding default code or location metadata.

## Core errors

| Error                       | Error codes                 | Additional navigation                                    |
| --------------------------- | --------------------------- | -------------------------------------------------------- |
| `SchemaValidationError`     | `schema-validation`         | optional boundary `location`; validator paths and codes  |
| `ContractError`             | `schema-validation`         | required HTTP contract `location`                        |
| `QueryTransportError`       | query transport code        | `key` and a query-located issue                          |
| `ClientResponseError`       | client response code        | original transport response and a response-located issue |
| `ServerImplementationError` | server implementation code  | `handlerKeys` and one issue per affected handler         |
| `ServerRuntimeError`        | server request/runtime code | HTTP `status` plus an optional boundary location         |

Invalid authoring arguments remain ordinary `TypeError` values. The structured interface is for failures that integrations and application error policies need to inspect programmatically.

## Protocol problems

`toAPIProblem()` converts any `APIError` into the JSON-safe `APIProblem` representation. It normalizes Standard Schema path segments and symbols while preserving error codes, issue codes, and locations:

```ts
import { isAPIError, toAPIProblem } from '@hulla/api/errors'
import { SchemaValidationError } from '@hulla/api/validation'

try {
  throw new SchemaValidationError(
    [{ message: 'Expected a non-empty id', path: ['id'] }],
    {
      location: 'params',
    },
  )
} catch (error) {
  if (isAPIError(error)) {
    const problem = toAPIProblem(error, {
      status: 400,
      title: 'Invalid request',
    })

    console.log(problem.status, problem.code, problem.issues?.[0]?.location) // 400 schema-validation params
  }
}
```

Server execution and adapters can use this conversion without defining a second issue format.
