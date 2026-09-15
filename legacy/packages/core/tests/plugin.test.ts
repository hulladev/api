import { describe, expect, expectTypeOf, test } from 'vitest'
import { z } from 'zod'
import { createApi } from '../src/api'
import { definePlugin } from '../src/types.public'
import type {
  APIPlugin,
  APIProcedureArgs,
  APIProcedureKey,
  APIProcedurePluginContext,
  APIProcedureResult,
  APIProcedureResultItem,
  APIRouterPluginContext,
} from '../src/types.public'

type QueryTypes = {
  queryOptions: (...args: APIProcedureArgs) => {
    queryKey: APIProcedureKey
    queryFn: () => APIProcedureResult
  }
  callProcedure: (...args: APIProcedureArgs) => APIProcedureResult
}

type RouterHook = (context: APIRouterPluginContext) => { routerName: () => string }
type ProcedureHook = (context: APIProcedurePluginContext) => {
  queryOptions: (...args: unknown[]) => { queryKey: readonly unknown[]; queryFn: () => unknown }
  callProcedure: (...args: unknown[]) => unknown
}

function tanstackPlugin(): APIPlugin<'tanstack', RouterHook, ProcedureHook, QueryTypes> {
  return definePlugin({
    id: 'tanstack',
    router: (context: APIRouterPluginContext) => ({
      routerName: () => context.router.name,
    }),
    procedure: (context: APIProcedurePluginContext) => ({
      queryOptions: (...args: unknown[]) => ({
        queryKey: (
          context.procedure as unknown as { $key: { full: (...args: unknown[]) => readonly unknown[] } }
        ).$key.full(...args),
        queryFn: () => context.procedure(...(args as [] | [unknown])),
      }),
      callProcedure: (...args: unknown[]) => context.procedure(...(args as [] | [unknown])),
    }),
    procedureTypes: undefined as unknown as QueryTypes,
  })
}

function secondaryPlugin() {
  return definePlugin({
    id: 'secondary' as const,
    procedure: () => ({ queryOptions: () => 'secondary' as const }),
    procedureTypes: undefined as unknown as { queryOptions: () => 'secondary' },
  })
}

function tanstackDbPlugin() {
  return definePlugin({
    id: 'tanstackDb' as const,
    namespace: 'tanstack' as const,
    procedure: () => ({ collectionOptions: (_options: unknown) => ({ live: true as const }) }),
    procedureTypes: undefined as unknown as {
      collectionOptions: (options: { getKey: (item: APIProcedureResultItem) => string | number }) => { live: true }
    },
  })
}

describe('plugins', () => {
  test('contextually types plugin author hooks without manual generic plumbing', () => {
    const plugin = definePlugin({
      id: 'authoring',
      router: (context) => {
        expectTypeOf(context.router.name).toEqualTypeOf<string>()
        expectTypeOf(context.pluginSettings.inject).toEqualTypeOf<'always' | 'opt-in'>()
        return { routerName: context.router.name }
      },
      procedure: (context) => ({ procedureType: context.meta.type }),
      procedureTypes: undefined as unknown as { procedureType: 'procedure' },
    })
    const routes = createApi({ plugins: [plugin] })
      .router('users')
      .define(({ procedure }) => ({ list: procedure.handler(() => 'ok') }))

    expect(routes.list.$authoring.procedureType).toBe('procedure')
  })

  test('places router and procedure helpers under the plugin identity', async () => {
    const api = createApi({ plugins: [tanstackPlugin()] })
    const routes = api.router('users').define(({ procedure, $tanstack }) => {
      expect($tanstack.routerName()).toBe('users')
      return {
        byId: procedure.input(z.string()).handler(async ({ input }) => input.toUpperCase()),
      }
    })

    expectTypeOf(routes.byId.$tanstack.queryOptions).parameter(0).toEqualTypeOf<string>()
    const options = routes.byId.$tanstack.queryOptions('sam')
    expect(options.queryKey).toStrictEqual(['users/byId', 'sam'])
    await expect(options.queryFn()).resolves.toBe('SAM')
    await expect(routes.byId.$tanstack.callProcedure('sam')).resolves.toBe('SAM')
  })

  test('supports opt-in namespaces using canonical plugin ids', () => {
    const api = createApi({
      plugins: [tanstackPlugin(), secondaryPlugin()],
      settings: { plugins: { tanstack: { inject: 'opt-in' as const } } },
    })
    const routes = api
      .router('users')
      .plugin('tanstack')
      .define(({ procedure }) => ({ byId: procedure.input(z.string()).handler(({ input }) => input) }))

    expect(routes.byId.$tanstack.queryOptions('sam').queryKey).toStrictEqual(['users/byId', 'sam'])
    expect(routes.byId.$secondary.queryOptions()).toBe('secondary')
  })

  test('applies aliases inside the plugin namespace', () => {
    const api = createApi({
      plugins: [tanstackPlugin()],
      settings: {
        plugins: {
          tanstack: { aliases: { procedure: { queryOptions: 'options' } } },
        },
      },
    })
    const routes = api.router('users').define(({ procedure }) => ({
      byId: procedure.input(z.string()).handler(({ input }) => input),
    }))
    const route = routes.byId as typeof routes.byId & {
      $tanstack: { options: (input: string) => { queryKey: readonly string[] } }
    }

    expect(route.$tanstack.options('sam').queryKey).toStrictEqual(['users/byId', 'sam'])
  })

  test('allows plugins with overlapping member names', () => {
    const api = createApi({ plugins: [tanstackPlugin(), secondaryPlugin()] })
    const routes = api.router('users').define(({ procedure }) => ({
      list: procedure.handler(() => [{ id: 1 }] as const),
    }))

    expect(routes.list.$tanstack.queryOptions().queryKey).toStrictEqual(['users/list'])
    expect(routes.list.$secondary.queryOptions()).toBe('secondary')
  })

  test('merges distinct plugin members into a shared namespace', () => {
    const api = createApi({ plugins: [tanstackPlugin(), tanstackDbPlugin()] })
    const routes = api.router('users').define(({ procedure }) => ({
      list: procedure.handler(() => [{ id: 1 }] as const),
    }))

    expect(routes.list.$tanstack.queryOptions().queryKey).toStrictEqual(['users/list'])
    expectTypeOf(routes.list.$tanstack.collectionOptions).parameter(0).toEqualTypeOf<{
      getKey: (item: { readonly id: 1 }) => string | number
    }>()
    expect(routes.list.$tanstack.collectionOptions({ getKey: (item) => item.id })).toStrictEqual({ live: true })
  })

  test('rejects colliding members inside a shared namespace', () => {
    const collision = definePlugin({
      id: 'collision' as const,
      namespace: 'tanstack' as const,
      procedure: () => ({ queryOptions: () => 'collision' }),
      procedureTypes: undefined as unknown as { queryOptions: () => string },
    })
    const api = createApi({ plugins: [tanstackPlugin(), collision] })

    expect(() => api.router('users').define(({ procedure }) => ({ list: procedure.handler(() => 'ok') }))).toThrow(
      'collides on key "queryOptions"'
    )
  })

  test('does not attach procedure plugins to unnamed handlers', () => {
    const standalone = createApi({ plugins: [tanstackPlugin()] }).procedure.handler(() => 'ok')
    expect(standalone).not.toHaveProperty('$tanstack')
  })

  test('rejects duplicate and reserved plugin identities', () => {
    expect(() => createApi({ plugins: [tanstackPlugin(), tanstackPlugin()] })).toThrow('Duplicate plugin id "tanstack"')
    expect(() => createApi({ plugins: [{ id: 'meta' as const }] })).toThrow(
      'Plugin "meta" namespace "$meta" is reserved'
    )
    expect(() => createApi({ plugins: [{ id: 'custom' as const, namespace: '$custom' as const }] })).toThrow(
      'must omit the framework-owned "$" prefix'
    )
  })

  test('rejects prototype-mutating plugin identities, namespaces, aliases, and members', () => {
    expect(() => createApi({ plugins: [{ id: '__proto__' as const }] })).toThrow('unsafe key "__proto__"')

    const namespaceAttack = definePlugin({
      id: 'namespaceAttack' as const,
      namespace: '__proto__' as const,
      router: () => ({ polluted: true }),
    })
    expect(() =>
      createApi({ plugins: [namespaceAttack] })
        .router('users')
        .define(({ procedure }) => ({ list: procedure.handler(() => 'ok') }))
    ).toThrow('unsafe key "__proto__"')

    expect(() =>
      createApi({
        plugins: [tanstackPlugin()],
        settings: { plugins: { tanstack: { aliases: { procedure: { queryOptions: 'constructor' } } } } },
      })
    ).toThrow('unsafe key "constructor"')

    const memberAttack = definePlugin({
      id: 'memberAttack' as const,
      procedure: () => Object.fromEntries([['prototype', true]]),
    })
    expect(() =>
      createApi({ plugins: [memberAttack] })
        .router('users')
        .define(({ procedure }) => ({ list: procedure.handler(() => 'ok') }))
    ).toThrow('unsafe key "prototype"')

    expect(({} as { polluted?: unknown }).polluted).toBeUndefined()
    expect(Function.prototype).not.toHaveProperty('polluted')
  })

  test('does not resolve aliases or plugin settings through inherited properties', () => {
    const inheritedSettings = Object.create({ tanstack: { inject: 'opt-in' } }) as {
      tanstack?: { inject: 'opt-in' }
    }
    const inheritedSettingsApi = createApi({
      plugins: [tanstackPlugin()],
      settings: { plugins: inheritedSettings },
    })
    const inheritedSettingsRoutes = inheritedSettingsApi.router('users').define(({ procedure }) => ({
      list: procedure.handler(() => 'ok'),
    }))

    expect(inheritedSettingsRoutes.list.$tanstack.queryOptions().queryKey).toStrictEqual(['users/list'])

    const inheritedAliases = Object.create({ queryOptions: 'constructor' }) as Record<string, string>
    const api = createApi({
      plugins: [tanstackPlugin()],
      settings: {
        plugins: {
          tanstack: { aliases: { procedure: inheritedAliases } },
        },
      },
    })
    const routes = api.router('users').define(({ procedure }) => ({
      list: procedure.handler(() => 'ok'),
    }))

    expect(routes.list.$tanstack.queryOptions().queryKey).toStrictEqual(['users/list'])
    expect(Object.getPrototypeOf(api.$meta.plugins.registry)).toBeNull()
    expect(Object.getPrototypeOf(api.$meta.plugins.settings)).toBeNull()
    expect(Object.getPrototypeOf(routes.list.$tanstack)).toBeNull()
  })
})
