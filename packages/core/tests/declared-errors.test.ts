import { describe, expect, expectTypeOf, test, vi } from 'vitest'
import { z } from 'zod'
import { createAdapterHandler } from '../src/adapters'
import { defineClient } from '../src/client'
import { defineContract } from '../src/contract'
import { defineErrors, isDeclaredError } from '../src/declared-errors'
import { inProcessTransport } from '../src/in-process'
import { response } from '../src/response'
import { route } from '../src/route'
import { defineServer } from '../src/server'

const failures = defineErrors({
  UNAUTHORIZED: { message: 'Authentication required' },
  ITEM_NOT_FOUND: {
    message: 'Item not found',
    data: z.object({ id: z.string() }),
  },
  ORGANIZATION_NOT_FOUND: { message: 'Organization not found' },
})

const contract = defineContract({
  errors: {
    401: failures.UNAUTHORIZED,
    404: [failures.ITEM_NOT_FOUND, failures.ORGANIZATION_NOT_FOUND],
  },
  routes: {
    returned: route.get('/returned', { responses: { 200: response.text() } }),
    thrown: route.get('/thrown', { responses: { 200: response.text() } }),
  },
})

const always = (): boolean => true

describe('declared errors', () => {
  test('creates fresh throwable occurrences with defaults and typed overrides', () => {
    const first = failures.UNAUTHORIZED()
    const second = failures.UNAUTHORIZED({ message: 'Sign in first' })
    const item = failures.ITEM_NOT_FOUND({ data: { id: 'item-1' } })

    expect(first).not.toBe(second)
    expect(first).toBeInstanceOf(Error)
    expect(isDeclaredError(first)).toBe(true)
    expect(first).toMatchObject({ code: 'UNAUTHORIZED', message: 'Authentication required' })
    expect(second.message).toBe('Sign in first')
    expect(item.data).toEqual({ id: 'item-1' })
    expectTypeOf(item.code).toEqualTypeOf<'ITEM_NOT_FOUND'>()
    expectTypeOf(item.data).toEqualTypeOf<{ id: string }>()
  })

  test('serializes returned and thrown occurrences through the same contract enrichment', async () => {
    const onError = vi.fn<(input: unknown) => void>()
    const dispatch = createAdapterHandler(
      defineServer(contract).implement({
        returned: ({ errors, response }) =>
          always() ? errors.ITEM_NOT_FOUND({ data: { id: 'item-1' } }) : response(200, 'ok'),
        thrown: ({ errors, response }) => {
          if (!always()) return response(200, 'ok')
          throw errors.ORGANIZATION_NOT_FOUND()
        },
      }),
      { onError }
    )

    await expect(dispatch({ request: {}, method: 'GET', pathname: '/returned' })).resolves.toEqual({
      status: 404,
      headers: { 'content-type': 'application/json' },
      body: {
        kind: 'json',
        value: { code: 'ITEM_NOT_FOUND', message: 'Item not found', data: { id: 'item-1' } },
      },
    })
    await expect(dispatch({ request: {}, method: 'GET', pathname: '/thrown' })).resolves.toMatchObject({
      status: 404,
      body: { kind: 'json', value: { code: 'ORGANIZATION_NOT_FOUND', message: 'Organization not found' } },
    })
    expect(onError).not.toHaveBeenCalled()
  })

  test('decodes declared failures as typed response values', async () => {
    const implementation = defineServer(contract).implement({
      returned: ({ errors, response }) =>
        always() ? errors.ITEM_NOT_FOUND({ data: { id: 'item-1' } }) : response(200, 'ok'),
      thrown: ({ response }) => response(200, 'ok'),
    })
    const client = defineClient(contract, { transport: inProcessTransport(implementation) }).create()
    const result = await client.returned()

    expect(result).toEqual({
      status: 404,
      headers: { 'content-type': 'application/json' },
      body: { code: 'ITEM_NOT_FOUND', message: 'Item not found', data: { id: 'item-1' } },
    })
    if (result.status === 404 && result.body.code === 'ITEM_NOT_FOUND') {
      expectTypeOf(result.body.data).toEqualTypeOf<{ id: string }>()
    }
  })

  test('can throw decoded failures from clients instead of returning them', async () => {
    const implementation = defineServer(contract).implement({
      returned: ({ errors, response }) =>
        always() ? errors.ITEM_NOT_FOUND({ data: { id: 'item-1' } }) : response(200, 'ok'),
      thrown: ({ response }) => response(200, 'ok'),
    })
    const client = defineClient(contract, {
      transport: inProcessTransport(implementation),
      errorMode: 'throw',
    }).create()

    await expect(client.returned()).rejects.toMatchObject({
      code: 'ITEM_NOT_FOUND',
      message: 'Item not found',
      data: { id: 'item-1' },
    })
    const success = await client.thrown()
    expectTypeOf(success.status).toEqualTypeOf<200>()
  })
})
