import type { DeleteMutationFnParams, InsertMutationFnParams, UpdateMutationFnParams } from '@tanstack/db'
import type { QueryFunctionContext } from '@tanstack/query-core'
import { queryCollectionOptions } from '@tanstack/query-db-collection'
import type { QueryCollectionConfig } from '@tanstack/query-db-collection'

type Procedure = ((...args: never[]) => unknown) & { $key: { root: string } }

export type CrudRoutes = {
  list: Procedure
  create: Procedure
  update: Procedure
  delete: Procedure
}

type ItemFor<Routes extends CrudRoutes> =
  Awaited<ReturnType<Routes['list']>> extends readonly (infer Item extends object)[] ? Item : never
type InputFor<Route extends Procedure> = Parameters<Route>[0]
type InputsFor<Route extends Procedure> = Parameters<Route>
type ItemKey<Item extends object> = {
  [Key in keyof Item]-?: Item[Key] extends string | number ? Key : never
}[keyof Item]
type Mutation<Params extends { transaction: { mutations: readonly unknown[] } }> =
  Params['transaction']['mutations'][number]

type CollectionBaseOptions<Item extends object, Key extends string | number> = Omit<
  QueryCollectionConfig<
    Item,
    (context: QueryFunctionContext<readonly [string]>) => Item[] | Promise<Item[]>,
    unknown,
    readonly [string],
    Key
  >,
  'getKey' | 'onDelete' | 'onInsert' | 'onUpdate' | 'queryFn' | 'queryKey' | 'select'
>

export type CrudCollectionOptions<
  Routes extends CrudRoutes,
  KeyName extends ItemKey<ItemFor<Routes>>,
> = CollectionBaseOptions<ItemFor<Routes>, Extract<ItemFor<Routes>[KeyName], string | number>> & {
  readonly routes: Routes
  readonly key: KeyName
  readonly mapInsert?: (
    mutation: Mutation<InsertMutationFnParams<ItemFor<Routes>, Extract<ItemFor<Routes>[KeyName], string | number>>>
  ) => InputFor<Routes['create']>
  readonly update?: (
    mutation: Mutation<UpdateMutationFnParams<ItemFor<Routes>, Extract<ItemFor<Routes>[KeyName], string | number>>>
  ) => InputsFor<Routes['update']>
  readonly remove?: (
    mutation: Mutation<DeleteMutationFnParams<ItemFor<Routes>, Extract<ItemFor<Routes>[KeyName], string | number>>>
  ) => InputFor<Routes['delete']>
  readonly refetch?: boolean
}

export function crudCollectionOptions<const Routes extends CrudRoutes, const KeyName extends ItemKey<ItemFor<Routes>>>(
  options: CrudCollectionOptions<Routes, KeyName>
) {
  type Item = ItemFor<Routes>
  type Key = Extract<Item[KeyName], string | number>

  const { routes, key, mapInsert, update, remove, refetch, ...collection } = options
  const persistenceResult = refetch === undefined ? undefined : { refetch }

  const queryOptions = queryCollectionOptions<Item, unknown, readonly [string], Key>({
    ...collection,
    queryKey: [routes.list.$key.root],
    queryFn: () => routes.list() as Item[] | Promise<Item[]>,
    getKey: (item) => item[key] as Key,
    onInsert: async ({ transaction }) => {
      await Promise.all(
        transaction.mutations.map((mutation) =>
          routes.create(mapInsert ? mapInsert(mutation) : (mutation.modified as InputFor<Routes['create']>))
        )
      )
      return persistenceResult
    },
    onUpdate: async ({ transaction }) => {
      await Promise.all(
        transaction.mutations.map((mutation) =>
          routes.update(
            ...(update
              ? update(mutation)
              : ([mutation.key, mutation.changes] as unknown as InputsFor<Routes['update']>))
          )
        )
      )
      return persistenceResult
    },
    onDelete: async ({ transaction }) => {
      await Promise.all(
        transaction.mutations.map((mutation) =>
          routes.delete(remove ? remove(mutation) : (mutation.key as InputFor<Routes['delete']>))
        )
      )
      return persistenceResult
    },
  })

  const create = async (input: InputFor<Routes['create']>) => {
    const created = (await routes.create(input)) as Item
    queryOptions.utils.writeInsert(created)
    return created
  }

  return {
    ...queryOptions,
    create,
  }
}
