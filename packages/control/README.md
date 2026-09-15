# @hulla/api-control

Result-returning clients for `@hulla/api`, using `ok`, `err`, and `Result` from `@hulla/control`.

```sh
bun add @hulla/api-control
```

Both `@hulla/api` and `@hulla/control` are regular dependencies. The integration is a separate package; installing or importing `@hulla/api` alone does not include it.

## Usage

```ts
import { defineContract, defineErrors, response, route } from '@hulla/api'
import { fetchTransport } from '@hulla/api/fetch'
import { createClient } from '@hulla/api-control'
import { z } from 'zod'

const errors = defineErrors({ NOT_FOUND: { data: z.object({ id: z.string() }) } })
const contract = defineContract({
  errors: { 404: errors.NOT_FOUND },
  routes: {
    user: route.get('/users/:id', {
      params: z.object({ id: z.string() }),
      responses: { 200: response.json(z.object({ id: z.string(), name: z.string() })) },
    }),
  },
})

const api = createClient(contract, {
  transport: fetchTransport({ baseUrl: 'https://api.example.com' }),
})
const result = await api.user({ params: { id: 'one' } })

if (result.isOk()) {
  console.log(result.value.body.name) // typed success body
} else if (result.error.kind === 'http') {
  const { response } = result.error
  console.log(response.status) // 404
  console.log(response.body.code) // 'NOT_FOUND'
  console.log(response.body.data.id) // string
} else {
  console.error(result.error.cause) // unknown: the original rejected/thrown value
}
```

The client accepts the standard transport, headers, context, middleware, and per-call request options, including `signal`. Route inputs, nested routers, and selected contract routes/routers keep their types. `errorMode` is not configurable: the integration needs declared errors returned so it can preserve their HTTP response metadata.

## Outcomes

- **2xx response:** `Ok<{ status, headers, body }>`; empty responses retain their absent body.
- **Declared non-2xx response:** `Err<{ kind: 'http', response }>`; both contract errors and ordinary route responses retain their status-specific body and headers. Redirect responses that reach the client are also non-success outcomes.
- **Rejected call:** `Err<{ kind: 'request', cause: unknown }>`; transport errors, cancellations, request encoding or response decoding failures, unexpected statuses, and context/middleware exceptions retain the original cause. An undeclared HTTP status is a request failure containing the original `ClientResponseError`, because no typed response decoder exists for it.

Use `isAPIError` from `@hulla/api/errors` to narrow structured causes and inspect their `code` and `issues`. Unknown causes are intentional: JavaScript callbacks can throw arbitrary values. Checking `kind` handles every failure category; checking HTTP `response.status` and then `response.body.code` narrows declared application errors.

Results support the methods provided by your installed `@hulla/control`, including `isOk()`, `isErr()`, `match()`, `pair()`, and `unwrap()`. `unwrap()` returns the contained value or error; it does not throw on failure.

Client construction errors still throw synchronously. A successful streaming or raw response transfers body ownership to the caller. Later stream iteration or raw body read failures occur after the initial Result has resolved and must be handled when consuming the body. Exceptions in your own Result callbacks also propagate normally.

This client reports failure as a resolved Result. Query/cache libraries that rely on rejected promises for retries or error state need an explicit conversion in their query function; do not pass a Result client in place of their ordinary `@hulla/api` client integration.

## Development

From the workspace root:

```sh
bun run --cwd packages/control typecheck
bun run --cwd packages/control test
bun run --cwd packages/control build
bun scripts/check-packages.ts --package=control
```
