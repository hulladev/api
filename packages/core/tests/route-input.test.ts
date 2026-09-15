import { describe, expect, expectTypeOf, test } from 'vitest'
import { z } from 'zod'
import { contractInput, defineContract } from '../src/contract'
import { response, routeOutput } from '../src/contract/response'
import { route } from '../src/contract/route'
import { router } from '../src/contract/router'
import { codec, decodeSchema, type SchemaInput, type SchemaOutput } from '../src/validation'

const integerParams = codec(z.object({ organizationId: z.string() }), z.object({ organizationId: z.int() }), {
  decode: ({ organizationId }) => ({ organizationId: Number(organizationId) }),
  encode: ({ organizationId }) => ({ organizationId: String(organizationId) }),
})
const booleanQuery = codec(z.object({ notify: z.enum(['true', 'false']) }), z.object({ notify: z.boolean() }), {
  decode: ({ notify }) => ({ notify: notify === 'true' }),
  encode: ({ notify }) => ({ notify: notify ? ('true' as const) : ('false' as const) }),
})

describe('contract route schemas', () => {
  test('composes route and router input as a Standard Schema', async () => {
    const organization = router('/organizations/:organizationId', {
      params: integerParams,
      routes: {
        create: route.post('/members', {
          query: booleanQuery,
          body: z.object({ name: z.string().transform((value) => value.trim()) }),
          responses: { 201: response.json(z.object({ id: z.string() })) },
        }),
      },
    })
    const contract = defineContract({ routes: { organization } })
    const schema = contractInput(contract, contract.routes.organization.create)
    const input = {
      params: { organizationId: 42 },
      query: { notify: true },
      body: { name: ' Ada ' },
    }

    await expect(decodeSchema(schema, input)).resolves.toEqual({
      params: { organizationId: 42 },
      query: { notify: true },
      body: { name: 'Ada' },
    })
    expectTypeOf<SchemaInput<typeof schema>>().toExtend<{
      params: { organizationId: number }
      query: { notify: boolean }
      body: { name: string }
    }>()
    expectTypeOf<SchemaOutput<typeof schema>>().toExtend<{
      params: { organizationId: number }
      query: { notify: boolean }
      body: { name: string }
    }>()
  })

  test('selects native response schemas', () => {
    const output = z.object({ id: z.string() })
    const declaration = route.get('/users/:id', {
      params: z.object({ id: z.string() }),
      responses: { 200: response.json(output) },
    })
    expect(routeOutput(declaration, 200)).toBe(output)
  })
})
