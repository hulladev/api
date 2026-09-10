import { expect, expectTypeOf, test } from 'vitest'
import { z } from 'zod'
import { defineContract, defineErrors, response, route, router } from '../src'
import { createClient } from '../src/client'
import { inProcessTransport } from '../src/in-process'
import { defineServer } from '../src/server'
import { codec } from '../src/validation'

test('selected clients retain inherited parameters, errors, and per-call context', async () => {
  const errors = defineErrors({ DENIED: { message: 'Denied' } })
  const contract = defineContract({
    basePath: '/api',
    errors: { 403: errors.DENIED },
    routes: {
      users: router('/users/:id', {
        params: z.object({ id: z.string() }),
        routes: {
          get: route.get('/', { responses: { 200: response.text() } }),
        },
      }),
    },
  })
  const implementation = defineServer(contract).implement({
    users: { get: ({ params }) => ({ status: 200, body: params.id }) },
  })
  const contexts: object[] = []
  const client = createClient(contract.routes.users, {
    transport: inProcessTransport(implementation),
    context: () => ({ calls: 1 }) as { calls: number },
    middleware: [
      ({ context, next }) => {
        contexts.push(context)
        return next()
      },
    ],
  })
  const result = await client.get({ params: { id: 'a / 雪' } })
  expect(result).toMatchObject({ status: 200, body: 'a / 雪' })
  if (result.status === 403) expectTypeOf(result.body.code).toEqualTypeOf<'DENIED'>()
  await client.get({ params: { id: 'b' } })
  expect(contexts).toEqual([{ calls: 1 }, { calls: 1 }])
  expect(contexts[0]).not.toBe(contexts[1])
})

test('public manifests and server bindings work without private construction identity', async () => {
  const contract = defineContract({ routes: { health: route.get('/health', { responses: { 200: response.text() } }) } })
  const implementation = defineServer(contract).implement({ health: () => ({ status: 200, body: 'ok' }) })
  const portableServer = { ...implementation }
  const selection = { ...contract.routes.health, $contract: contract.routes.health.$contract }
  const call = createClient(selection, { transport: inProcessTransport(portableServer) })
  await expect(call()).resolves.toMatchObject({ status: 200, body: 'ok' })
})

test('fixes route identity before middleware while allowing header changes', async () => {
  const contract = defineContract({ routes: { health: route.get('/health', { responses: { 200: response.text() } }) } })
  const call = createClient(contract.routes.health, {
    transport: (request) => {
      expect(request.path).toBe('/health')
      expect(request.key).toEqual(['health'])
      expect(request.headers['authorization']).toBe('token')
      return { status: 200, headers: { 'content-type': 'text/plain' }, readBody: () => 'ok' }
    },
    middleware: [
      ({ request, next }) => {
        expect(Reflect.set(request, 'path', '/other')).toBe(false)
        expect(Reflect.set(request, 'key', ['other'])).toBe(false)
        request.headers['authorization'] = 'token'
        return next()
      },
    ],
  })
  await call()
})

test('ordinary response transforms execute on the server only', async () => {
  const contract = defineContract({
    routes: {
      value: route.get('/', {
        responses: {
          200: response.json(z.date().transform((value) => value.toISOString())),
        },
      }),
    },
  })
  const implementation = defineServer(contract).implement({
    value: () => ({ status: 200, body: new Date('2026-01-01') }),
  })
  const client = createClient(contract, { transport: inProcessTransport(implementation) })
  expect((await client.value()).body).toBe('2026-01-01T00:00:00.000Z')
})

test('codecs validate their declared representations and decode application values', async () => {
  let wireChecks = 0
  let applicationChecks = 0
  let decodes = 0
  const schema = codec(
    z.string().refine(() => {
      wireChecks++
      return true
    }),
    z.date().refine(() => {
      applicationChecks++
      return true
    }),
    {
      decode: (value) => {
        decodes++
        return new Date(value)
      },
      encode: (value) => value.toISOString(),
    }
  )
  const contract = defineContract({ routes: { value: route.get('/', { responses: { 200: response.json(schema) } }) } })
  const implementation = defineServer(contract).implement({
    value: () => ({ status: 200, body: new Date('2026-01-01') }),
  })
  const transport = inProcessTransport(implementation)
  await createClient(contract, { transport }).value()
  expect([wireChecks, applicationChecks, decodes]).toEqual([2, 2, 1])
  const invalid = createClient(contract, {
    transport: () => ({ status: 200, headers: { 'content-type': 'application/json' }, readBody: () => 'invalid date' }),
  })
  await expect(invalid.value()).rejects.toMatchObject({ code: 'schema-validation' })
})
