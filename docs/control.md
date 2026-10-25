# Result-returning clients

`@hulla/api-control` makes client calls return a [Result](/docs/control/results). Successful responses become `Ok`; failures become `Err`, so you can handle both without a `try/catch` around each call.

## Install the integration

`@hulla/api-control` declares `@hulla/api` and `@hulla/control` as regular dependencies, so installing this package brings them along. The example uses Zod as the application-owned Standard Schema validator.

<!-- docs:package-manager -->

```sh
# Bun
bun add @hulla/api-control zod

# npm
npm install @hulla/api-control zod

# pnpm
pnpm add @hulla/api-control zod

# Yarn
yarn add @hulla/api-control zod
```

## Define one contract and implementation

The contract below declares a successful user response and a named `404` application error. Keep the contract in shared code; the implementation belongs in a server-only module.

```ts filename="src/api/contract.ts"
import { defineContract, defineErrors, response, route } from '@hulla/api'
import { z } from 'zod'

const errors = defineErrors({
  NOT_FOUND: {
    data: z.object({ id: z.string() }),
  },
})

export const contract = defineContract({
  errors: { 404: errors.NOT_FOUND },
  routes: {
    user: route.get('/users/:id', {
      params: z.object({ id: z.string() }),
      responses: {
        200: response.json(z.object({ id: z.string(), name: z.string() })),
      },
    }),
  },
})
```

```ts filename="src/api/server.ts"
import { defineServer } from '@hulla/api/server'
import { contract } from './contract'

export const implementation = defineServer(contract).implement({
  user: ({ params, response, errors }) => {
    if (params.id === 'one') {
      return response(200, { id: 'one', name: 'Ada' })
    }

    throw errors.NOT_FOUND({ data: { id: params.id } })
  },
})
```

Mount the implementation with the Fetch adapter in the host that owns the HTTP listener:

```ts filename="src/api/server-entry.ts"
import { fetchAdapter } from '@hulla/api/fetch'
import { implementation } from './server'

export const handler = fetchAdapter().mount(implementation)
```

## Call the Fetch endpoint and inspect the Result

`@hulla/api-control` keeps the standard client's route inputs and transport options, but wraps the resolved response in a `Result`:

```ts filename="src/api/client.ts"
import { fetchTransport } from '@hulla/api/fetch'
import { createClient } from '@hulla/api-control'
import { contract } from './contract'
import { handler } from './server-entry'

const api = createClient(contract, {
  transport: fetchTransport({
    baseUrl: 'https://api.test',
    fetch: handler,
  }),
})

const result = await api.user({ params: { id: 'missing' } })

if (result.isOk()) {
  console.log(result.value.body.name)
} else if (result.isErr() && result.error.kind === 'http') {
  console.log(result.error.response.status) // 404
  console.log(result.error.response.body.code) // 'NOT_FOUND'
  console.log(result.error.response.body.data.id) // 'missing'
} else {
  console.error(result.error.cause)
}
```

This handler-backed call crosses the Fetch request and response boundary without opening a socket. In deployment,
register `handler` with the Web-standard host and remove the custom `fetch` option; use the deployed origin for
`baseUrl`.

The `404` branch is an `Err` with `kind: 'http'`, and its `response` keeps the declared status, headers, and body type. A `2xx` response is an `Ok` whose `value` is the ordinary status-specific response. A transport failure, cancellation, request-encoding failure, response-decoding failure, unexpected status, or context/middleware exception is an `Err` with `kind: 'request'` and the original `cause`.

## Choose the failure boundary deliberately

The control client always uses return mode internally. `errorMode` is not an available option: passing it is rejected by the type signature because changing it would conflict with the `Result` return contract. Declared non-2xx responses are therefore values inside `Err<{ kind: 'http'; response }>` rather than thrown exceptions.

The wrapper captures failures from the client call, but not every later operation:

- Client construction still throws synchronously when the source or options are invalid.
- A lazy stream can return an initial `Ok` and fail later while its body is read or iterated. Handle that failure at the stream consumer, and release the stream when finished.
- Exceptions thrown by your own `Result` callbacks propagate normally; the client does not wrap application code that runs after the result arrives.

Use the standard client when a framework data API or query library expects rejected promises for retries and error state. A `Result` client resolves failures instead, so do not pass it directly as a query function that relies on rejection. Convert the `Result` to the library's expected success-or-throw shape, or use the standard client and its [query-library integrations](./plugins.md).

For the standard status-discriminated client and transport choices, continue with [client authoring](./client-authoring.md). For declared errors and operational failure types, read the [error model](./errors.md).
