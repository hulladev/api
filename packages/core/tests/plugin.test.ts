import { describe, expect, expectTypeOf, test, vi } from 'vitest'
import { z } from 'zod'
import { defineClient } from '../src/client'
import { defineContract } from '../src/contract'
import {
  type APIClientPluginRouteHook,
  type APIClientPluginRouterHook,
  type APIProcedurePluginHook,
  type APIProcedurePluginRouterHook,
  definePlugin,
} from '../src/plugin'
import { defineProcedures } from '../src/procedure'
import { response } from '../src/response'
import { route } from '../src/route'
import { router } from '../src/router'
import { defineServer } from '../src/server'

const contract = defineContract({
  routes: {
    health: route.get('/health', { responses: { 200: response.json(z.literal('ok')) } }),
    nested: router('/nested', {
      routes: {
        health: route.get('/health', { responses: { 200: response.json(z.literal('ok')) } }),
      },
    }),
  },
})

type PluginMetadataTypes = { readonly pluginPath: string }

const clientMetadataRoute: APIClientPluginRouteHook<PluginMetadataTypes> = ({ route: compiled }) => ({
  pluginPath: compiled.path,
})
const clientMetadataRouter: APIClientPluginRouterHook<PluginMetadataTypes> = ({ key }) => ({
  pluginPath: key.prefix.join('/'),
})

const clientPlugin = definePlugin({
  id: 'clientMetadata',
  client: {
    route: clientMetadataRoute,
    router: clientMetadataRouter,
  },
})

const serverBuild = vi.fn()
const serverPlugin = definePlugin({
  id: 'serverBuild',
  server: { build: serverBuild },
})

const sharedPlugin = definePlugin({
  id: 'shared',
  client: { build: vi.fn() },
  server: { build: vi.fn() },
})

const procedureMetadataProcedure: APIProcedurePluginHook<PluginMetadataTypes> = ({ key }) => ({
  pluginPath: key.prefix.join('/'),
})
const procedureMetadataRouter: APIProcedurePluginRouterHook<PluginMetadataTypes> = ({ key }) => ({
  pluginPath: key.prefix.join('/'),
})
const procedurePlugin = definePlugin({
  id: 'procedureMetadata',
  procedures: {
    procedure: procedureMetadataProcedure,
    router: procedureMetadataRouter,
  },
})

describe('API plugins', () => {
  test('adds typed route members directly to client calls', () => {
    const definition = defineClient(contract, { plugins: [clientPlugin, sharedPlugin] })
    const client = definition.build()

    expectTypeOf(client.health.$pluginPath).toEqualTypeOf<string>()
    expectTypeOf(client.nested.$pluginPath).toEqualTypeOf<string>()
    expect(definition.plugins).toEqual([clientPlugin, sharedPlugin])
    expect(Object.keys(clientPlugin.client)).toEqual(['route', 'router'])
    expect('target' in clientPlugin).toBe(false)
    expect(client.health.$pluginPath).toBe('/health')
    expect(client.nested.$pluginPath).toBe('nested')
  })

  test('adds typed members to built procedure trees', () => {
    const procedures = defineProcedures({ plugins: [procedurePlugin] })
    const health = procedures.handler(() => 'ok')
    const api = procedures.build({ nested: { health } })

    expectTypeOf(api.nested.$pluginPath).toEqualTypeOf<string>()
    expectTypeOf(api.nested.health.$pluginPath).toEqualTypeOf<string>()
    expect(procedures.plugins).toEqual([procedurePlugin])
    expect(api.nested.$pluginPath).toBe('nested')
    expect(api.nested.health.$pluginPath).toBe('nested/health')

    const collision = procedures.handler(() => 'collision')
    expect(() => procedures.build({ nested: { $pluginPath: collision } })).toThrowError(
      'router member "$pluginPath" collides with the router'
    )
  })

  test('runs server build hooks after validating handlers', () => {
    const definition = defineServer(contract, { plugins: [serverPlugin, sharedPlugin] })
    const handlers = {
      health: () => ({ status: 200 as const, body: 'ok' as const }),
      nested: { health: () => ({ status: 200 as const, body: 'ok' as const }) },
    }
    const server = definition.build(handlers)

    expect(server.plugins).toEqual([serverPlugin, sharedPlugin])
    expect(serverBuild).toHaveBeenCalledWith({ contract, handlers })
  })

  test('infers capabilities at the type and JavaScript boundaries', () => {
    const invalidTypes = () => {
      // @ts-expect-error Client-only plugins cannot be registered with a server definition.
      defineServer(contract, { plugins: [clientPlugin] })
      // @ts-expect-error Server-only plugins cannot be registered with a client definition.
      defineClient(contract, { plugins: [serverPlugin] })
      // @ts-expect-error Client-only plugins cannot be registered with a procedure definition.
      defineProcedures({ plugins: [clientPlugin] })
      // @ts-expect-error Procedure-only plugins cannot be registered with a client definition.
      defineClient(contract, { plugins: [procedurePlugin] })
      // @ts-expect-error Plugins must provide at least one capability section.
      definePlugin({ id: 'empty' })
    }
    expectTypeOf(invalidTypes).toBeFunction()

    expect(() => defineServer(contract, { plugins: [clientPlugin] as never })).toThrowError(
      'does not provide server hooks and cannot be used by a server definition'
    )
    expect(() => defineClient(contract, { plugins: [serverPlugin] as never })).toThrowError(
      'does not provide client hooks and cannot be used by a client definition'
    )
    expect(() => defineProcedures({ plugins: [clientPlugin] as never })).toThrowError(
      'does not provide procedures hooks and cannot be used by a procedure definition'
    )
    expect(() => defineClient(contract, { plugins: [{ id: 'empty' }] as never })).toThrowError(
      'must provide client, server, or procedures hooks'
    )
  })

  test('rejects duplicate ids, client member collisions, and framework-owned members', () => {
    expect(() => defineClient(contract, { plugins: [clientPlugin, clientPlugin] })).toThrowError('Duplicate plugin id')

    const collision = definePlugin({
      id: 'collision',
      client: { route: () => ({ pluginPath: 'collision' }) },
    })
    expect(() => defineClient(contract, { plugins: [clientPlugin, collision] }).build()).toThrowError(
      'route member "$pluginPath" collides with plugin "clientMetadata"'
    )

    const reserved = definePlugin({
      id: 'reserved',
      client: { route: () => ({ meta: {} }) },
    })
    expect(() => defineClient(contract, { plugins: [reserved] }).build()).toThrowError(
      'route member "$meta" is reserved by @hulla/api'
    )

    const prefixed = definePlugin({
      id: 'prefixed',
      client: { route: () => ({ $call: () => undefined }) },
    })
    expect(() => defineClient(contract, { plugins: [prefixed] }).build()).toThrowError(
      'route member "$call" must omit the framework-owned "$" prefix'
    )

    const routerCollisionContract = defineContract({
      routes: {
        nested: router('/nested', {
          routes: {
            $pluginPath: route.get('/plugin-path', {
              responses: { 200: response.json(z.literal('ok')) },
            }),
          },
        }),
      },
    })
    expect(() => defineClient(routerCollisionContract, { plugins: [clientPlugin] }).build()).toThrowError(
      'router member "$pluginPath" collides with the client router'
    )
  })
})
