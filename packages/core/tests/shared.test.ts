import { expectTypeOf, test } from 'vitest'
import type {
  ClientContextFactory,
  ClientContextInput,
  ClientContractRouteMetadata,
  ClientMiddlewareInput,
  ClientMiddlewareNextResult,
} from '../src/client'
import { defineContract } from '../src/contract'
import { response } from '../src/response'
import { route } from '../src/route'
import type {
  MiddlewareNextResult,
  ServerContextFactory,
  ServerContextInput,
  ServerMiddlewareInput,
  ServerRouteMetadata,
} from '../src/server'

const contract = defineContract({
  routes: {
    health: route.get('/health', { responses: { 200: response.text() } }),
  },
})

test('client and server bindings share context and middleware primitives', () => {
  type Context = { readonly requestId: string }

  expectTypeOf<ClientContractRouteMetadata<typeof contract>>().toEqualTypeOf<ServerRouteMetadata<typeof contract>>()
  expectTypeOf<ClientContextInput<typeof contract>>().toEqualTypeOf<ServerContextInput<typeof contract>>()
  expectTypeOf<ClientContextFactory<Context, typeof contract>>().toEqualTypeOf<
    ServerContextFactory<Context, typeof contract>
  >()
  expectTypeOf<ClientMiddlewareInput<Context, typeof contract>>().toEqualTypeOf<
    ServerMiddlewareInput<Context, typeof contract>
  >()
  expectTypeOf<ClientMiddlewareNextResult<string>>().toEqualTypeOf<MiddlewareNextResult<string>>()
})
