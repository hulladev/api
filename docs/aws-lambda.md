# AWS Lambda

Serve your API from AWS Lambda with `@hulla/api-aws-lambda`. It accepts API Gateway payload-v2 events or Function URL requests and returns the response format Lambda expects.

## Install the adapter

Configure API Gateway with **payload format 2.0**. Payload-v1 events aren’t supported. Lambda Function URLs already use the v2 format. See AWS’s [HTTP API setup](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-develop-integrations-lambda.html) or [Function URL setup](https://docs.aws.amazon.com/lambda/latest/dg/urls-invocation.html).

This guide assumes the Lambda project and its HTTP trigger already exist. The example uses Zod for request and response
schemas. `@types/aws-lambda` supplies the event and invocation-context types required by the adapter.

<!-- docs:package-manager -->

```sh
# Bun
bun add @hulla/api @hulla/api-aws-lambda zod && bun add --dev @types/aws-lambda

# npm
npm install @hulla/api @hulla/api-aws-lambda zod && npm install --save-dev @types/aws-lambda

# pnpm
pnpm add @hulla/api @hulla/api-aws-lambda zod && pnpm add --save-dev @types/aws-lambda

# Yarn
yarn add @hulla/api @hulla/api-aws-lambda zod && yarn add --dev @types/aws-lambda
```

## Mount a route and invoke the handler

Declare the HTTP boundary in a module shared by server and client code:

```ts
// src/api/contract.ts
import { defineContract, response, route } from '@hulla/api'
import { z } from 'zod'

export const contract = defineContract({
  basePath: '/api',
  routes: {
    profile: route.get('/profiles/:id', {
      params: z.object({ id: z.string() }),
      responses: {
        200: response.json(
          z.object({ id: z.string(), runtime: z.string() })
        ),
      },
    }),
  },
})
```

Implement the route in server-only code:

```ts
// src/api/server.ts
import { defineServer } from '@hulla/api/server'
import { contract } from './contract'

export const implementation = defineServer(contract).implement({
  profile: ({ params, response }) =>
    response(200, {
      id: params.id,
      runtime: 'aws-lambda',
    }),
})
```

Export the mounted function as the Lambda handler configured by the project:

```ts
// src/lambda.ts
import { awsLambdaAdapter } from '@hulla/api-aws-lambda'
import { implementation } from './api/server'

export const handler = awsLambdaAdapter().mount(implementation)
```

The exported function has the same `(event, context)` shape that Lambda invokes. Call it directly with a payload-v2
event to check the route before deployment; AWS supplies the remaining event and context fields in production:

```ts
// scripts/verify-lambda.ts
import type { APIGatewayProxyEventV2, Context } from 'aws-lambda'
import { handler } from '../src/lambda'

const result = await handler(
  {
    rawPath: '/api/profiles/user-1',
    rawQueryString: '',
    headers: {},
    requestContext: { http: { method: 'GET' } },
    isBase64Encoded: false,
  } as APIGatewayProxyEventV2,
  { awsRequestId: 'local-1' } as Context
)

console.log(result.statusCode) // 200
console.log(JSON.parse(result.body ?? '{}'))
// { id: 'user-1', runtime: 'aws-lambda' }
```

The handler returns a structured Lambda result, not a Web `Response`. API Gateway or the Function URL converts its
status, headers, cookies, body, and `isBase64Encoded` flag into the public HTTP response.

## Follow the event-to-result lifecycle

For each invocation:

1. AWS passes a payload-v2 event and Lambda invocation context to the exported handler.
2. The adapter reads the method from `requestContext.http.method` and uses `rawPath` as the contract pathname by
   default.
3. It parses `rawQueryString`, combines event cookies into a request `cookie` header when one is not already present,
   and decodes any declared request body.
4. `@hulla/api` validates the contract inputs, creates server context, runs middleware, and calls the route handler.
5. The adapter serializes the declared result as an `AWSLambdaResponse` for the payload-v2 integration.

Repeated query fields remain repeated values for contract validation. An unmatched contract path returns `404`; a
known path with the wrong method returns `405`. API Gateway route selection happens before this handler runs, so its
routes and fallbacks remain AWS configuration rather than adapter configuration.

## Match the contract to `rawPath`

For an HTTP API custom domain, payload format 2.0 omits the API mapping key from `rawPath`. Match the contract's
`basePath` to the path the event contains, not automatically to every prefix in the public URL.

| Public request URL                               | Event `rawPath`        | Matching contract route |
| ------------------------------------------------ | ---------------------- | ----------------------- |
| `https://api.example.com/v1/api/profiles/user-1` | `/api/profiles/user-1` | `/api/profiles/:id`     |

In that example, `/v1` selects the API at the AWS boundary and should not be added to the contract. AWS documents this
payload-format difference in its [HTTP API Lambda integration
guide](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-develop-integrations-lambda.html).

Use the `pathname` mount option only when the event path and contract path intentionally differ. For example, this
normalizes an event path without `/api` to a contract whose `basePath` is `/api`:

```ts
// src/lambda.ts
export const handler = awsLambdaAdapter().mount(implementation, {
  pathname: (event) => `/api${event.rawPath}`,
})
```

Adding the wrong prefix makes every otherwise valid request miss the contract route.

## Add invocation state to server context

Use `adapter.context()` when handlers need the invocation ID, remaining Lambda execution time, or another value from
the original event. Define the context and mount the implementation through the same adapter:

```ts
// src/lambda.ts
import { defineServer } from '@hulla/api/server'
import { awsLambdaAdapter } from '@hulla/api-aws-lambda'
import { contract } from './api/contract'

const adapter = awsLambdaAdapter()

const implementation = defineServer(contract, {
  context: adapter.context(({ lambdaContext, route }) => ({
    invocationId: lambdaContext.awsRequestId,
    remainingTime: () => lambdaContext.getRemainingTimeInMillis(),
    routeKey: route.key.join('.'),
  })),
}).implement({
  profile: ({ params, context, response }) => {
    console.info(
      context.invocationId,
      context.remainingTime(),
      context.routeKey
    )
    return response(200, {
      id: params.id,
      runtime: 'aws-lambda',
    })
  },
})

export const handler = adapter.mount(implementation)
```

`adapter.context()` binds this implementation to the AWS Lambda adapter. Mounting it through another adapter fails
during setup rather than supplying incompatible native state.

The standard Lambda handler shape does not expose a client-disconnect signal. The handler's portable `signal` therefore
does not abort when a caller disconnects or the invocation approaches its deadline. Use
`lambdaContext.getRemainingTimeInMillis()` when application work needs its own deadline policy.

## Know how bodies, headers, and streams cross the boundary

| Contract representation | Lambda adapter behavior |
| ----------------------- | ----------------------- |
| JSON and text | Decodes a base64 event body first when `isBase64Encoded` is true. JSON responses are stringified; text responses remain strings. |
| Bytes and form data | Reads request bytes from the event. Responses are base64 encoded and return `isBase64Encoded: true`. |
| Stream | Collects `Uint8Array` chunks into memory, then returns one base64-encoded body. It does not deliver chunks incrementally. |
| Raw | Passes through a native Lambda result only when its `statusCode` matches the declared contract status. |

The adapter writes `Set-Cookie` values to the payload-v2 `cookies` array. Other repeated response-header values are
joined with commas. It does not expose an adapter-level body-size option; AWS request, response, memory, and execution
limits still apply.

A declared stream is a producer API inside the implementation, but this adapter's public result is buffered. If stream
collection fails, the adapter calls the source iterator's `return()` when available and reports the failure as a
transport error. Choose Lambda's separate response-streaming handler and deployment protocol when time to first byte
or responses larger than the buffered path require incremental delivery; this adapter does not opt into that protocol.
See [AWS Lambda response streaming](https://docs.aws.amazon.com/lambda/latest/dg/configuration-response-streaming.html).

## Observe or replace adapter failures

Pass `onError` to `mount()` to log a failure with both the HTTP event and Lambda invocation state:

```ts
// src/lambda.ts
export const handler = adapter.mount(implementation, {
  onError({ error, phase, event, lambdaContext, defaultResponse }) {
    console.error({
      error,
      phase,
      invocationId: lambdaContext.awsRequestId,
      requestId: event.requestContext.requestId,
    })
    return defaultResponse
  },
})
```

The hook receives a protocol-safe default `AWSLambdaResponse`. Return it or `undefined` to keep the fallback, or return
another Lambda result with an integer `statusCode` to replace it. If the hook throws or returns an invalid replacement,
the adapter keeps the default response without invoking the hook again.

Keep expected application outcomes in declared contract responses. Use `onError` for failures while matching routes,
decoding or validating inputs, creating context, running middleware or handlers, validating outputs, or serializing the
Lambda result.

## Keep unsupported triggers outside this adapter

The adapter accepts API Gateway HTTP API payload format 2.0 and Lambda Function URL events. It does not accept REST API
payload format 1.0, Application Load Balancer, WebSocket, or non-HTTP trigger events. Queue, stream, schedule, and storage
events should call application services directly because they do not represent an `@hulla/api` HTTP request.

The adapter returns a handler but does not create the Lambda function, select a Node.js runtime, configure API Gateway,
create a Function URL, grant invocation permissions, or deploy infrastructure.

## Next steps

- [Server context and middleware](./server-context.md) explains portable request context and route policies.
- [Server fragments and composition](./server-composition.md) shows how to mount selected route groups.
- [Typed clients](./client-authoring.md) calls the deployed Lambda endpoint through the same contract.
- [Adapter behavior](./adapter-conformance.md) compares body ownership, buffering, routing, and cancellation across
  hosts.
