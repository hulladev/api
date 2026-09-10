import type { StandardSchemaV1 } from '@standard-schema/spec'
import * as v from 'valibot'
import { expect, expectTypeOf, test } from 'vitest'
import { z } from 'zod'
import { codec, defineContract, request, response, route, router } from '../src'
import { createClient } from '../src/client'
import { inProcessTransport } from '../src/in-process'
import { defineServer } from '../src/server'

// oxlint-disable-next-line vitest/expect-expect -- Invalid declarations are checked by TypeScript.
test('reports representation mistakes at request and response helpers', () => {
  request.json(z.string().transform((value) => new Date(value)))
  response.json(z.date().transform((value) => value.toISOString()))
  request.json(
    v.pipe(
      v.string(),
      v.transform((value) => new Date(value))
    )
  )
  response.json(
    v.pipe(
      v.date(),
      v.transform((value) => value.toISOString())
    )
  )
  // @ts-expect-error JSON requests accept wire inputs, not native Dates.
  request.json(z.date())
  // @ts-expect-error Valibot Dates are not JSON request inputs either.
  request.json(v.date())
  response.json(
    // @ts-expect-error Ordinary JSON responses cannot produce Date objects.
    v.pipe(
      v.string(),
      v.transform((value) => new Date(value))
    )
  )
  // @ts-expect-error A type-only JSON declaration does not serialize bigint.
  request.json<{ count: bigint }>()
  // @ts-expect-error Text response transforms must output text.
  response.text(z.string().transform(Number))
  response.text(z.number().transform(String))
  // @ts-expect-error Header schema outputs must be textual.
  response.empty({ headers: v.object({ count: v.number() }) })
})

test('selected nested clients preserve optional headers and asymmetric types across validators', async () => {
  const contract = defineContract({
    routes: {
      teams: router('/teams/:team', {
        params: z.object({ team: z.string() }),
        routes: {
          double: route.post('/double', {
            headers: v.object({ 'x-trace': v.optional(v.string()) }),
            body: request.json(v.object({ count: v.pipe(v.string(), v.transform(Number)) })),
            responses: {
              200: response.json(v.object({ count: v.pipe(v.number(), v.transform(String)) }), {
                headers: v.object({ 'x-trace': v.optional(v.string()) }),
              }),
            },
          }),
        },
      }),
    },
  })
  const implementation = defineServer(contract).implement({
    teams: {
      double: ({ body, headers, params }) => {
        expectTypeOf(body.count).toEqualTypeOf<number>()
        expectTypeOf(params.team).toEqualTypeOf<string>()
        expectTypeOf(headers['x-trace']).toEqualTypeOf<string | undefined>()
        return { status: 200, body: { count: body.count * 2 }, headers }
      },
    },
  })
  const call = createClient(contract.routes.teams.double, { transport: inProcessTransport(implementation) })
  const result = await call({ params: { team: 'one' }, headers: {}, body: { count: '2' } })
  expectTypeOf(result.body.count).toEqualTypeOf<string>()
  expect(result.body.count).toBe('4')
  expect(result.headers['x-trace']).toBeUndefined()
  const checkInvalidCalls = async () => {
    // @ts-expect-error Selection retains inherited parameters.
    await call({ headers: {}, body: { count: '2' } })
    // @ts-expect-error The caller supplies request schema input, not handler output.
    await call({ params: { team: 'one' }, headers: {}, body: { count: 2 } })
  }
  expectTypeOf(checkInvalidCalls).toBeFunction()
})

test('custom asynchronous codec schemas need no async marker', async () => {
  const wire: StandardSchemaV1<string> = {
    '~standard': {
      version: 1,
      vendor: 'test',
      validate: async (value) => (typeof value === 'string' ? { value } : { issues: [{ message: 'Expected text' }] }),
    },
  }
  const application: StandardSchemaV1<number> = {
    '~standard': {
      version: 1,
      vendor: 'test',
      validate: async (value) =>
        typeof value === 'number' && Number.isFinite(value)
          ? { value }
          : { issues: [{ message: 'Expected finite number' }] },
    },
  }
  const numeric = codec(wire, application, {
    encode: async (value) => String(value),
    decode: async (value) => Number(value),
  })
  const contract = defineContract({
    routes: {
      double: route.post('/', {
        body: request.json(numeric),
        responses: { 200: response.json(numeric) },
      }),
    },
  })
  const implementation = defineServer(contract).implement({ double: ({ body }) => ({ status: 200, body: body * 2 }) })
  const client = createClient(contract, { transport: inProcessTransport(implementation) })
  expect((await client.double({ body: 2 })).body).toBe(4)
})
