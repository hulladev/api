import { describe, expect, test } from 'vitest'
import { routes, users } from './swr.test'

describe('mutation companion plugin', () => {
  test('uses the aliased mutation helper name on finalized handlers', async () => {
    const aliasedAll = routes.all as typeof routes.all & {
      swrMutation: {
        options: () => readonly [readonly ['users/all'], () => typeof users]
      }
    }
    const aliasedById = routes.byId as typeof routes.byId & {
      swrMutation: {
        options: ((
          input: number
        ) => readonly [readonly ['users/byId', number], () => Promise<(typeof users)[number]>]) &
          (() => readonly [readonly ['users/byId'], (input: number) => Promise<(typeof users)[number]>])
      }
    }

    expect(aliasedAll).toHaveProperty('swrMutation')
    expect(aliasedById).toHaveProperty('swrMutation')

    const [allKey, allMutation] = aliasedAll.swrMutation.options()
    const [byIdKey, byIdMutation] = aliasedById.swrMutation.options(2)
    const [byIdRootKey, byIdMutationWithInput] = aliasedById.swrMutation.options()

    expect(allKey).toStrictEqual(['users/all'])
    expect(byIdKey).toStrictEqual(['users/byId', 2])
    expect(byIdRootKey).toStrictEqual(['users/byId'])
    expect(allMutation()).toStrictEqual(users)
    await expect(byIdMutationWithInput(2)).resolves.toStrictEqual(users[1])
    await expect(byIdMutation()).resolves.toStrictEqual(users[1])
  })
})
