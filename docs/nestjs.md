# NestJS

`@hulla/api-nestjs` registers contract routes as Nest controller methods. They can use your application's dependency injection and guards. The example adds `GET /items/:id` to an existing Nest app.

## Before you start

Use Node.js 22 or newer and NestJS `11.1+` or `12.0.1+` with either the Express or Fastify platform adapter. An
existing Nest application already has the Nest, `reflect-metadata`, and `rxjs` dependencies that the adapter uses.
Add the `@hulla/api` packages and the validator used in this example:

<!-- docs:package-manager -->

```sh
# Bun
bun add @hulla/api @hulla/api-nestjs zod

# npm
npm install @hulla/api @hulla/api-nestjs zod

# pnpm
pnpm add @hulla/api @hulla/api-nestjs zod

# Yarn
yarn add @hulla/api @hulla/api-nestjs zod
```

The application must also install one Nest platform package: `@nestjs/platform-express` or
`@nestjs/platform-fastify`. That choice does not change the contract or handler code below.

## Declare and implement one route

Define the shared HTTP shape in `src/api/contract.ts`:

```ts
import { defineContract, response, route } from '@hulla/api'
import { z } from 'zod'

const item = z.object({
  id: z.string(),
  name: z.string(),
})

export const contract = defineContract({
  routes: {
    getItem: route.get('/items/:id', {
      params: z.object({ id: z.string() }),
      responses: {
        200: response.json(item),
      },
    }),
  },
})
```

Implement that route in `src/api/server.ts`:

```ts
import { defineServer } from '@hulla/api/server'
import { contract } from './contract'

export const implementation = defineServer(contract).implement({
  getItem: ({ params, response }) =>
    response(200, { id: params.id, name: 'Notebook' }),
})
```

The contract supplies the method, path, and schemas. The implementation supplies the behavior. See
[contracts](./contract-authoring.md) and [server implementations](./server-authoring.md) for the full authoring APIs.

## Mount the generated controller

`mount()` returns a controller class. Add that class to the same `controllers` array as a handwritten Nest
controller:

```ts
// src/app.module.ts
import { Module } from '@nestjs/common'
import { nestAdapter } from '@hulla/api-nestjs'
import { implementation } from './api/server'

const ApiController = nestAdapter().mount(implementation)

@Module({
  controllers: [ApiController],
})
export class AppModule {}
```

Start the application through its ordinary Nest bootstrap:

```ts
// src/main.ts
import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  await app.listen(3000)
}

void bootstrap()
```

Request the contract path:

```sh
curl -i http://localhost:3000/items/42
```

```http
HTTP/1.1 200 OK
content-type: application/json; charset=utf-8

{"id":"42","name":"Notebook"}
```

Nest registers the exact contract method and path. A global prefix still applies, so
`app.setGlobalPrefix('v1')` moves this endpoint to `/v1/items/42`.

## Choose `mount()` or `register()`

| API                           | Use it when                                                              |
| ----------------------------- | ------------------------------------------------------------------------ |
| `mount(implementation)`       | The implementation already exists and does not need Nest to construct it |
| `register(contract, options)` | Nest providers are required to construct the implementation              |

`register()` returns a dynamic module. Its factory must implement every route in the contract passed to it:

```ts
// src/app.module.ts
import { Injectable, Module } from '@nestjs/common'
import { nestAdapter } from '@hulla/api-nestjs'
import { defineServer } from '@hulla/api/server'
import { contract } from './api/contract'

@Injectable()
class ItemService {
  find(id: string) {
    return { id, name: 'Notebook' }
  }
}

const adapter = nestAdapter()
const ApiModule = adapter.register(contract, {
  providers: [ItemService],
  inject: [ItemService],
  useFactory: (items: ItemService) =>
    defineServer(contract).implement({
      getItem: ({ params, response }) => response(200, items.find(params.id)),
    }),
})

@Module({
  imports: [ApiModule],
})
export class AppModule {}
```

`imports` can make providers from other Nest modules available to the factory, and `scope` can set the generated
implementation provider's scope. Async factories and request-scoped injected providers use Nest's normal lifecycle.

> `mount()` can also mount a server fragment. `register()` compiles the supplied contract and therefore requires a
> complete implementation of that same contract.

## Follow one request through Nest and `@hulla/api`

For a matching request:

1. Nest's router matches the generated controller method. Global prefixes and guards run as usual.
2. The adapter reads native path parameters, query values, headers, and the already parsed body.
3. `@hulla/api` validates the declared input, creates server context, runs middleware and the handler, and serializes
   the declared response.
4. Nest interceptors can wrap the result, and the selected Express or Fastify platform writes the response.

This division is why the integration does not replace Nest modules or introduce a second dependency-injection system.

## Keep host policy in Nest

| Responsibility                                                                 | Owner                           |
| ------------------------------------------------------------------------------ | ------------------------------- |
| Routing, global prefixes, guards, interceptors, and exception filters          | Nest                            |
| Providers and request scope                                                    | Nest                            |
| Body parsers, multipart plugins, and body-size limits                          | Express or Fastify through Nest |
| Contract input validation, server middleware, handlers, and declared responses | `@hulla/api`                    |
| Mapping contract routes and responses to the native host                       | `@hulla/api-nestjs`             |

The adapter reads `request.body`; it does not recover bytes from the underlying request stream. Configure the matching
Nest/platform parser before mounting routes that accept text, bytes, or form data. Configure Nest raw-body support when
signature verification needs the original bytes.

Use `adapter.context(({ request, response }) => ...)` when a handler needs native request data. Pass platform-specific
request and response types to `nestAdapter<Request, Response>()` when the common `NestRequest` type is not enough.
Prefer injected providers for application services and native context for request-specific host details.

`controllerDecorators` applies class decorators to the generated controller. `routeDecorators` receives each route's
`key`, `method`, and `path` and returns method decorators. Use these options for guards, interceptors, or metadata
that belong in Nest's request lifecycle.

## Know the integration limits

- Only Nest's Express and Fastify platform adapters are supported.
- `QUERY` contract routes fail during controller creation because the supported Nest versions do not route that
  method consistently.
- Unmatched paths use the host's normal 404 behavior.
- Guard and interceptor failures remain Nest failures. Adapter `onError` observes core runtime, serialization, and
  transport failures and may replace a response only before it is committed.
- Streaming responses use Nest's `StreamableFile`. A disconnect closes the source; a producer failure after response
  commitment closes the transport instead of returning a truncated successful response.
- `HEAD` keeps the response headers and suppresses the body.

Continue with [server context and middleware](./server-context.md) for portable request state, or compare host behavior
in [adapter behavior](./adapter-conformance.md).
