import { describe, expect, expectTypeOf, test, vi } from 'vitest'
import { z } from 'zod'
import { defineClient } from '../src/client'
import { defineContract } from '../src/contract'
import { definePlugin } from '../src/plugin'
import { response } from '../src/response'
import { route } from '../src/route'
import { defineServer } from '../src/server'

const contract = defineContract({
  routes: {
    health: route.get('/health', { responses: { 200: response.json(z.literal('ok')) } }),
  },
})

const clientPlugin = definePlugin({
  id: 'clientMetadata',
  target: 'client',
  namespace: 'metadata',
  client: {
    route: ({ route: compiled }) => ({ path: compiled.path }),
    routeTypes: undefined as unknown as { readonly path: string },
  },
})

const serverBuild = vi.fn()
const serverPlugin = definePlugin({
  id: 'serverBuild',
  target: 'server',
  server: { build: serverBuild },
})

const universalPlugin = definePlugin({
  id: 'shared',
  target: 'universal',
  client: { build: vi.fn() },
  server: { build: vi.fn() },
})

describe('API plugins', () => {
  test('adds typed, namespaced route members to client calls', () => {
    const definition = defineClient(contract, { plugins: [clientPlugin, universalPlugin] })
    const client = definition.build()

    expectTypeOf(client.health.$metadata.path).toEqualTypeOf<string>()
    expect(definition.plugins).toEqual([clientPlugin, universalPlugin])
    expect(client.health.$metadata.path).toBe('/health')
    expect(Object.isFrozen(client.health.$metadata)).toBe(true)
  })

  test('runs server build hooks after validating handlers', () => {
    const definition = defineServer(contract, { plugins: [serverPlugin, universalPlugin] })
    const handlers = { health: () => ({ status: 200 as const, body: 'ok' as const }) }
    const server = definition.build(handlers)

    expect(server.plugins).toEqual([serverPlugin, universalPlugin])
    expect(serverBuild).toHaveBeenCalledWith({ contract, handlers })
  })

  test('enforces declared targets at the type and JavaScript boundaries', () => {
    const invalidTypes = () => {
      // @ts-expect-error Client-only plugins cannot be registered with a server definition.
      defineServer(contract, { plugins: [clientPlugin] })
      // @ts-expect-error Server-only plugins cannot be registered with a client definition.
      defineClient(contract, { plugins: [serverPlugin] })
    }
    expectTypeOf(invalidTypes).toBeFunction()

    expect(() => defineServer(contract, { plugins: [clientPlugin] as never })).toThrowError(
      'targets client and cannot be used by a server definition'
    )
    expect(() => defineClient(contract, { plugins: [serverPlugin] as never })).toThrowError(
      'targets server and cannot be used by a client definition'
    )
  })

  test('rejects duplicate ids, namespaces, and reserved namespaces', () => {
    expect(() => defineClient(contract, { plugins: [clientPlugin, clientPlugin] })).toThrowError('Duplicate plugin id')
    expect(() =>
      defineClient(contract, {
        plugins: [clientPlugin, definePlugin({ id: 'other', target: 'client', namespace: 'metadata' })],
      })
    ).toThrowError('Duplicate plugin namespace')
    expect(() =>
      defineClient(contract, { plugins: [definePlugin({ id: 'reserved', target: 'client', namespace: 'key' })] })
    ).toThrowError('namespace "$key" is reserved')
  })
})
