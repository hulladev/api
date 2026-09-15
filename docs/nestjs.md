# NestJS

Install `@hulla/api-nestjs` alongside core and the NestJS peers listed in its manifest. NestJS 11 and 12 are supported
on their Express and Fastify platform adapters. This package uses the existing core route runtime; no Nest dependencies
or Nest-specific APIs are added to core.

```ts
import { Module } from '@nestjs/common'
import { nestAdapter } from '@hulla/api-nestjs'

const adapter = nestAdapter()
const ApiController = adapter.mount(implementation)

@Module({ controllers: [ApiController] })
export class AppModule {}
```

`mount` supports complete implementations and fragments. For dependency injection, import the dynamic module returned by
`adapter.register(contract, { inject: [Service], useFactory: (service) => implementation, providers: [Service] })`.
Build the implementation inside that factory to use the injected service. Async factories and request-scoped dependencies
are supported; the factory must return an implementation of every route in the supplied contract. Imports and provider
scope can be supplied through `imports` and `scope`.

Generated routes are native Nest controllers. Global prefixes, guards, interceptors and exception filters remain Nest's
responsibility. Add metadata with `controllerDecorators` or `routeDecorators: ({ key, method, path }) => [...]`, for
example `UseGuards(...)` or `SetMetadata(...)`. Core handler exceptions follow core's contract error handling; Nest guards
and interceptors execute outside that handler. `onError` handles adapter failures; after streaming starts it is observational.

`adapter.context(...)` exposes the native `request` and `response`. Pass the platform's request and response types as
`nestAdapter<Request, Response>()` when you need platform-specific properties. This context retains the adapter identity
checks used by the other integrations.

The host owns body parsing and its default limits. Configure text, binary or multipart parsers/plugins in the Nest
application when those representations are needed. This integration does not replace parsers or impose body limits.
JSON, text, bytes, empty responses, repeated headers, raw Web Responses and streaming responses are supported. Streams
use Nest's StreamableFile, cancel on disconnect, and terminate visibly on producer failure. HEAD suppresses the body.
Native router behavior controls route precedence, missing routes and unsupported methods. QUERY routes are rejected
because they are not supported consistently across the advertised Nest versions.

Shared conformance runs on both platforms with multipart explicitly excluded as plugin-owned. Native tests verify
request-scoped DI, guards, interceptors, metadata, prefixes, fragments and context. Isolated packed consumers run on
both platforms for each supported Nest major.
