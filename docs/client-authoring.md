# Client authoring

`defineClient()` mirrors server authoring: configure a scope, derive it with `use()`, then call `build()`. The built value is the contract-shaped callable tree itself—there is no extra `routes`, `api`, or procedure namespace:

```ts
import { defineClient } from '@hulla/api/client'

const client = defineClient(contract, {
  baseUrl: 'https://api.example.com',
}).build()

const result = await client.organizations.createUser({
  params: { organizationId, userId },
  query: { notify: true },
  headers: { 'x-actor-id': actorId },
  body: { createdAt: new Date() },
})

if (result.status === 201) {
  result.body
  result.headers
}
```

Routes without declared request data take only optional request-scoped Fetch options:

```ts
await client.health()
await client.health({ signal })
```

Routes with declared request data take those options as a second argument:

```ts
await client.organizations.createUser(input, { signal })
```

## Context and middleware

Client context follows the server context model. A context factory runs once per request with the fully encoded `Request` and exact route metadata:

```ts
const base = defineClient(contract, {
  baseUrl: 'https://api.example.com',
  context: ({ request, route }) => ({
    accessToken: session.accessToken,
    requestUrl: request.url,
    routeKey: route.key,
  }),
})
```

Middleware receives one options object, matching server and procedure middleware. `middleware()` defines a reusable middleware value, `use()` returns a derived scope, and `build()` materializes the callable tree:

```ts
const authenticate = base.middleware(async ({ context, next, request }) => {
  request.headers.set('authorization', `Bearer ${context.accessToken}`)
  return next()
})

export const client = base.use(authenticate).build()
```

Middleware wraps the complete transport operation, including response decoding. It can prepare the request, perform logging or tracing before and after `next()`, and reject a call. Higher-level result policies belong in application procedures.

Client middleware can also stop every route with a contract-level error through its typed `response(status, body, headers?)` helper. Responses without declared header schemas receive an empty `Headers` instance by default.

## Transport boundary

Each client leaf performs exactly one Fetch call. Ordinary schemas expose their input types directly; explicit codecs encode shared application values before the declared HTTP representation is serialized. The selected response declaration is then decoded back into its application value.

Like Fetch, the client does not throw merely because a response has a 4xx or 5xx status. Route responses and contract-level middleware errors are returned as a status-discriminated union. Network failures, schema failures, content-type mismatches, and statuses absent from both response maps reject the call.

The core does not add retries, caching, deduplication, domain exceptions, loading state, or query-library behavior. Those policies can be ordinary application functions:

```ts
export async function createUser(input: Parameters<typeof client.organizations.createUser>[0]) {
  const result = await client.organizations.createUser(input)

  if (result.status !== 201) {
    throw new Error(`Could not create user: ${result.status}`)
  }

  return result.body
}
```

Use an `@hulla/api/procedure` procedure only when its schema, context, middleware, or structural identity provides concrete value. Procedures do not change or wrap the client surface.
