import { describe, expect, test } from 'vitest'
import { z } from 'zod'
import { api } from '../src/api'
import type {
  APIPlugin,
  APIPluginList,
  APIProcedureArgs,
  APIProcedureKey,
  APIProcedureKeyRoot,
  APIProcedurePluginContext,
  APIProcedureResult,
  APIRouterPluginContext,
  APISettings,
  Middleware,
  Schema,
} from '../src/types.public'
import type { UseBuilderArgs } from '../src/types.private'

function invokeProcedure<F extends (...args: any[]) => unknown>(fn: F, args: Parameters<F>): ReturnType<F> {
  return fn(...args) as ReturnType<F>
}

type QueryProcedureTypeHook = {
  query: {
    options: {
      (...args: APIProcedureArgs): {
        queryKey: APIProcedureKey
        queryFn: () => APIProcedureResult
      }
      (): {
        queryKey: readonly [APIProcedureKeyRoot]
        queryFn: (...args: APIProcedureArgs) => APIProcedureResult
      }
    }
  }
  callProcedure: (...args: APIProcedureArgs) => APIProcedureResult
}

type SecondaryProcedureTypeHook = {
  secondaryOptions: () => 'secondary'
}

const queryRouter = <
  M extends Middleware,
  UA extends UseBuilderArgs<M> | undefined,
  N extends string,
  S extends APISettings,
  P extends APIPluginList,
>(
  ctx: APIRouterPluginContext<M, UA, N, S, P>
) => ({
  routerName: () => ctx.router.name,
})

const queryProcedure = <
  M extends Middleware,
  IA extends UseBuilderArgs<M> | undefined,
  LA extends UseBuilderArgs<M> | undefined,
  SI extends Schema | undefined,
  SO extends Schema | undefined,
  RN extends string | undefined,
  S extends APISettings,
  P extends APIPluginList,
  N extends string | undefined,
>(
  ctx: APIProcedurePluginContext<M, IA, LA, SI, SO, RN, S, P, N>
) => {
  if (!('name' in ctx.meta)) {
    return {}
  }

  const routerName = 'router' in ctx.meta ? ctx.meta.router : undefined
  const procedureName = ctx.meta.name
  const root = routerName === undefined ? procedureName : `${routerName}/${procedureName}`

  return {
    query: {
      options: ((...args: Parameters<typeof ctx.call>) => {
        if (args.length === 0) {
          return {
            queryKey: [root] as const,
            queryFn: (...nextArgs: Parameters<typeof ctx.call>) => invokeProcedure(ctx.call, nextArgs),
          }
        }

        return {
          queryKey:
            routerName === undefined
              ? ([procedureName, ...args] as const)
              : ([routerName, procedureName, ...args] as const),
          queryFn: () => invokeProcedure(ctx.call, args),
        }
      }) as unknown as QueryProcedureTypeHook['query']['options'],
    },
    callProcedure: (...args: Parameters<typeof ctx.call>) => invokeProcedure(ctx.call, args),
  }
}

function createQueryPlugin(): APIPlugin<'query', typeof queryRouter, typeof queryProcedure, QueryProcedureTypeHook> {
  return {
    id: 'query',
    router: queryRouter,
    procedure: queryProcedure,
    procedureTypes: undefined as unknown as QueryProcedureTypeHook,
  }
}

function createSecondaryPlugin(): APIPlugin<
  'secondary',
  undefined,
  () => { secondaryOptions: () => 'secondary' },
  SecondaryProcedureTypeHook
> {
  return {
    id: 'secondary',
    procedure: () => ({
      secondaryOptions: () => 'secondary' as const,
    }),
    procedureTypes: undefined as unknown as SecondaryProcedureTypeHook,
  }
}

function createConflictingProcedurePlugin(): APIPlugin<'conflict', undefined, () => { query: { options: () => string } }> {
  return {
    id: 'conflict',
    procedure: () => ({
      query: {
        options: () => 'conflict',
      },
    }),
  }
}

function createReservedRouterPlugin(): APIPlugin<'reserved', () => { procedure: () => string }> {
  return {
    id: 'reserved',
    router: () => ({
      procedure: () => 'reserved',
    }),
  }
}

describe('plugins', () => {
  test('injects router helpers and procedure namespaces with finalized route metadata', async () => {
    const h = api({
      plugins: [createQueryPlugin()],
    })

    const routes = h.router('users').define(({ procedure, routerName }) => {
      expect(routerName()).toBe('users')

      return {
        byId: procedure.input(z.string()).handler(async ({ input }) => input.toUpperCase()),
      }
    })

    const byId = routes.byId as typeof routes.byId & {
      key: {
        root: 'users/byId'
      }
      query: {
        options: (input: string) => {
          queryKey: readonly [string, string, string]
          queryFn: () => Promise<string>
        }
      }
      callProcedure: (input: string) => Promise<string>
    }

    expect(byId.key.root).toBe('users/byId')
    const options = byId.query.options('sam')
    expect(options.queryKey).toStrictEqual(['users', 'byId', 'sam'])
    await expect(options.queryFn()).resolves.toBe('SAM')
    await expect(byId.callProcedure('sam')).resolves.toBe('SAM')
  })

  test('supports opt-in plugins on routers and procedures using canonical ids', () => {
    const h = api({
      plugins: [createQueryPlugin(), createSecondaryPlugin()],
      settings: {
        plugins: {
          query: {
            inject: 'opt-in' as const,
          },
        },
      },
    })

    const routerSelected = h.router('users').plugin('query').define(({ procedure, routerName }) => {
      expect(routerName()).toBe('users')

      return {
        byId: procedure.input(z.string()).handler(({ input }) => input.toUpperCase()),
      }
    })

    const routerSelectedById = routerSelected.byId as typeof routerSelected.byId & {
      query: {
        options: (input: string) => { queryKey: readonly [string, string, string] }
      }
      secondaryOptions: () => 'secondary'
    }

    expect(routerSelectedById.query.options('sam').queryKey).toStrictEqual(['users', 'byId', 'sam'])
    expect(routerSelectedById.secondaryOptions()).toBe('secondary')

    const procedureSelected = h.router('teams').define(({ procedure }) => ({
      byId: procedure.plugin('query').input(z.string()).handler(({ input }) => input.length),
    }))

    const procedureSelectedById = procedureSelected.byId as typeof procedureSelected.byId & {
      query: {
        options: (input: string) => { queryKey: readonly [string, string, string] }
      }
      secondaryOptions: () => 'secondary'
    }

    expect(procedureSelectedById.query.options('core').queryKey).toStrictEqual(['teams', 'byId', 'core'])
    expect(procedureSelectedById.secondaryOptions()).toBe('secondary')

    const unselected = h.router('posts').define(({ procedure }) => ({
      list: procedure.handler(() => ['a'] as const),
    }))

    const unselectedList = unselected.list as typeof unselected.list & {
      secondaryOptions: () => 'secondary'
    }

    expect(unselected.list).not.toHaveProperty('query')
    expect(unselectedList.secondaryOptions()).toBe('secondary')
  })

  test('applies aliases without changing plugin ids used by .plugin()', () => {
    const h = api({
      plugins: [createQueryPlugin()],
      settings: {
        plugins: {
          query: {
            inject: 'opt-in' as const,
            aliases: {
              router: {
                routerName: 'routerInfo',
              },
              procedure: {
                query: 'request',
              },
            },
          },
        },
      },
    })

    const routes = h.router('users').plugin('query').define((builders) => {
      const { procedure } = builders
      const { routerInfo } = builders as typeof builders & { routerInfo: () => string }
      expect(routerInfo()).toBe('users')

      return {
        byId: procedure.input(z.string()).handler(({ input }) => input.toUpperCase()),
      }
    })

    const aliasedRoute = routes.byId as typeof routes.byId & {
      request: {
        options: (input: string) => { queryKey: readonly string[] }
      }
      callProcedure: (input: string) => string
    }

    expect(aliasedRoute.request.options('sam').queryKey).toStrictEqual(['users', 'byId', 'sam'])
    expect(aliasedRoute.callProcedure('sam')).toBe('SAM')
  })

  test('does not attach procedure plugins to unnamed top-level handlers', () => {
    const h = api({
      plugins: [createQueryPlugin()],
    })

    const standalone = h.procedure.input(z.string()).handler(({ input }) => input.toUpperCase())

    expect(standalone.call('sam')).toBe('SAM')
    expect(standalone).not.toHaveProperty('key')
    expect(standalone).not.toHaveProperty('query')
    expect(standalone).not.toHaveProperty('callProcedure')
  })

  test('throws on duplicate plugin ids and post-alias collisions', () => {
    expect(() =>
      api({
        plugins: [createQueryPlugin(), createQueryPlugin()],
      })
    ).toThrow('Duplicate plugin id "query"')

    const duplicateMethods = api({
      plugins: [createQueryPlugin(), createConflictingProcedurePlugin()],
    })

    expect(() =>
      duplicateMethods.router('users').define(({ procedure }) => ({
        byId: procedure.input(z.string()).handler(({ input }) => input),
      }))
    ).toThrow('Procedure plugin "conflict" collides on key "query"')

    const reserved = api({
      plugins: [createReservedRouterPlugin()],
    })

    expect(() =>
      reserved.router('users').define(({ procedure }) => ({
        byId: procedure.handler(() => 'ok'),
      }))
    ).toThrow('Router plugin "reserved" cannot expose reserved key "procedure"')
  })
})
