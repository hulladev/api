import { expectTypeOf, test } from 'vitest'
import { defineContract, response, route } from '../src'
import type {
  ClientContextFactory,
  ClientContextInput,
  ClientContractRouteMetadata,
  ClientMiddlewareInput,
  ClientMiddlewareNext,
  ClientTransportRequest,
} from '../src/client'
import type {
  ServerContextFactory,
  ServerContextInput,
  ServerMiddlewareInput,
  ServerMiddlewareNext,
  ServerRouteMetadata,
} from '../src/server'

const contract = defineContract({
  routes: {
    health: route.get('/health', { responses: { 200: response.text() } }),
  },
})

test('client and server bindings share metadata while keeping transport state client-side', () => {
  type Context = { readonly requestId: string }

  expectTypeOf<ClientContractRouteMetadata<typeof contract>>().toEqualTypeOf<ServerRouteMetadata<typeof contract>>()
  expectTypeOf<ClientContextInput<typeof contract>['request']>().toEqualTypeOf<ClientTransportRequest>()
  expectTypeOf<keyof ServerContextInput<typeof contract>>().toEqualTypeOf<'route' | 'signal'>()
  expectTypeOf<
    Parameters<ClientContextFactory<Context, typeof contract>>[0]['request']
  >().toEqualTypeOf<ClientTransportRequest>()
  expectTypeOf<keyof Parameters<ServerContextFactory<Context, typeof contract>>[0]>().toEqualTypeOf<
    'route' | 'signal'
  >()
  expectTypeOf<ClientMiddlewareInput<Context, typeof contract>['request']>().toEqualTypeOf<ClientTransportRequest>()
  expectTypeOf<keyof ServerMiddlewareInput<Context, typeof contract>>().toEqualTypeOf<'context' | 'route' | 'signal'>()
  expectTypeOf<ClientMiddlewareNext<string>>().toEqualTypeOf<ServerMiddlewareNext<string>>()
})
