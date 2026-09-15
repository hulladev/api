import { definePlugin } from '@hulla/api'
import type {
  APIPlugin,
  APIPluginRuntimeSettings,
  APIProcedureKeyRoot,
  APIProcedureMappedResultItem,
  APIProcedurePluginContext,
  APIProcedureResult,
  APIProcedureResultItem,
  APIProcedureResultItemMapper,
  APIProcedureTypeOpaque,
} from '@hulla/api/plugin'
import type { CollectionConfig, UtilsRecord } from '@tanstack/db'
import type { QueryFunctionContext } from '@tanstack/query-core'
import { queryCollectionOptions } from '@tanstack/query-db-collection'
import type { QueryCollectionConfig } from '@tanstack/query-db-collection'

export type TanStackDbPluginConfig<Namespace extends string = 'tanstack'> = APIPluginRuntimeSettings & {
  readonly namespace?: Namespace
  /**
   * Generates collection factories for named hand-written routers. Drizzle sources
   * and `crud(table)` presets discover their CRUD resources and keys automatically.
   * Set this to `false` to disable automatic Drizzle collection generation.
   */
  readonly collections?: false | Readonly<Record<string, string | { readonly key: string }>>
}

type ProcedureContext = APIProcedurePluginContext

type CollectionProcedureHook = (context: ProcedureContext) => {
  collectionOptions: (options: TanStackDbCollectionOptions<object, string | number>) => CollectionConfig<object>
}

type ProcedureQueryFn = (context: QueryFunctionContext<readonly [APIProcedureKeyRoot]>) => APIProcedureResult

interface CollectionConfigMapper extends APIProcedureResultItemMapper {
  readonly output: this['input'] extends object
    ? CollectionConfig<this['input'], string | number, never, UtilsRecord>
    : never
}

export type TanStackDbCollectionOptions<Item extends object, Key extends string | number = string | number> = Omit<
  QueryCollectionConfig<Item, ProcedureQueryFn, unknown, readonly [APIProcedureKeyRoot], Key>,
  'queryFn' | 'queryKey' | 'select'
>

type CollectionProcedureTypeHook = {
  collectionOptions: (options: {
    queryClient: APIProcedureTypeOpaque<import('@tanstack/query-core').QueryClient>
    getKey: (item: APIProcedureResultItem) => string | number
    id?: string
    enabled?: boolean
    staleTime?: number
    gcTime?: number
    retry?: boolean | number
    retryDelay?: number
    refetchInterval?: number | false
    meta?: Record<string, unknown>
    onInsert?: (event: unknown) => unknown
    onUpdate?: (event: unknown) => unknown
    onDelete?: (event: unknown) => unknown
  }) => APIProcedureMappedResultItem<CollectionConfigMapper>
}

type TanStackDbPlugin<Namespace extends string> = APIPlugin<
  'tanstackDb',
  undefined,
  CollectionProcedureHook,
  CollectionProcedureTypeHook,
  Namespace
>

export function tanstackDbPlugin(
  config?: TanStackDbPluginConfig<'tanstack'> & { readonly namespace?: undefined }
): TanStackDbPlugin<'tanstack'>
export function tanstackDbPlugin<const Namespace extends string>(
  config: TanStackDbPluginConfig<Namespace> & { readonly namespace: Namespace }
): TanStackDbPlugin<Namespace>
export function tanstackDbPlugin(config: TanStackDbPluginConfig<string> = {}): TanStackDbPlugin<string> {
  const procedure: CollectionProcedureHook = (context) => ({
    collectionOptions: (options) => {
      if (context.meta.input !== undefined) {
        throw new Error('collectionOptions() requires a procedure without input that returns an array.')
      }

      const root = (context.procedure as unknown as { $key: { root: string } }).$key.root
      const createOptions = queryCollectionOptions as unknown as (
        config: Record<string, unknown>
      ) => CollectionConfig<object, string | number, never, UtilsRecord>
      return createOptions({
        ...(options as unknown as Record<string, unknown>),
        queryKey: [root] as const,
        queryFn: () => context.procedure() as unknown as object[] | Promise<object[]>,
      })
    },
  })

  return definePlugin({
    id: 'tanstackDb',
    namespace: config.namespace ?? 'tanstack',
    procedure,
    procedureTypes: undefined as unknown as CollectionProcedureTypeHook,
    defaults: {
      inject: config.inject,
      aliases: config.aliases,
    },
    generation: {
      from: '@hulla/api-tanstack-db',
      name: 'tanstackDbPlugin',
      options: config,
    },
  } satisfies TanStackDbPlugin<string>)
}
