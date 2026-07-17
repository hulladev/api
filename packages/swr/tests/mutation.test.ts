import { describe, expect, test } from 'vitest'
import { routes, users } from './swr.test'

describe('swr plugin mutation helper', () => {
  test('uses the aliased mutation helper name on finalized handlers', async () => {
    const aliasedAll = routes.all as typeof routes.all & {
      $swr: {
        swrMutation: () => readonly [readonly ['users/all'], () => typeof users]
      }
    }
    const aliasedById = routes.byId as typeof routes.byId & {
      $swr: {
        swrMutation: ((
          input: number
        ) => readonly [readonly ['users/byId', number], () => Promise<(typeof users)[number]>]) &
          (() => readonly [readonly ['users/byId'], (input: number) => Promise<(typeof users)[number]>])
      }
    }

    expect(aliasedAll.$swr).toHaveProperty('swrMutation')
    expect(aliasedById.$swr).toHaveProperty('swrMutation')

    const [allKey, allMutation] = aliasedAll.$swr.swrMutation()
    const [byIdKey, byIdMutation] = aliasedById.$swr.swrMutation(2)
    const [byIdRootKey, byIdMutationWithInput] = aliasedById.$swr.swrMutation()

    expect(allKey).toStrictEqual(['users/all'])
    expect(byIdKey).toStrictEqual(['users/byId', 2])
    expect(byIdRootKey).toStrictEqual(['users/byId'])
    expect(allMutation()).toStrictEqual(users)
    await expect(byIdMutationWithInput(2)).resolves.toStrictEqual(users[1])
    await expect(byIdMutation()).resolves.toStrictEqual(users[1])
  })
})
