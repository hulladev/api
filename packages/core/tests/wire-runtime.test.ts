import { describe, expect, expectTypeOf, test, vi } from 'vitest'
import { z } from 'zod'
import { defineContract } from '../src/contract'
import { request } from '../src/request'
import { response } from '../src/response'
import { route } from '../src/route'
import { defineServer } from '../src/server'
import { createWireHandler, type WireServerHandler, type WireServerResponse } from '../src/wire'

function createRuntime() {
  const contract = defineContract({
    routes: {
      echo: route.post('/echo', {
        body: z.object({ message: z.string() }),
        responses: { 200: response.json(z.object({ message: z.string() })) },
      }),
      dynamic: route.get('/users/:id', {
        params: z.object({ id: z.string() }),
        responses: { 200: response.text() },
      }),
      current: route.get('/users/me', {
        responses: { 200: response.text() },
      }),
      bytes: route.post('/bytes', {
        body: request.bytes(),
        responses: { 200: response.bytes() },
      }),
    },
  })
  const server = defineServer(contract)
  return createWireHandler(
    server.build({
      echo: (input) => ({ status: 200, body: input.body }),
      dynamic: (input) => ({ status: 200, body: input.params.id }),
      current: () => ({ status: 200, body: 'current' }),
      bytes: (input) => ({ status: 200, body: input.body }),
    })
  )
}

describe('wire server runtime', () => {
  test('dispatches adapter-extracted values and returns a structured response', async () => {
    const dispatch = createRuntime()
    const original = { adapter: 'test' }

    expectTypeOf(dispatch).toEqualTypeOf<WireServerHandler>()
    const result = await dispatch({
      request: original,
      method: 'POST',
      pathname: '/echo',
      headers: { 'content-type': 'application/json' },
      body: { value: { message: 'already parsed' } },
    })

    expect(result).toEqual({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: { kind: 'json', value: { message: 'already parsed' } },
    })
    expectTypeOf(result).toEqualTypeOf<WireServerResponse>()
  })

  test('requests lazy body extraction with the declared representation', async () => {
    const dispatch = createRuntime()
    const readBody = vi.fn(async () => new Uint8Array([1, 2, 3]))

    const result = await dispatch({
      request: {},
      method: 'POST',
      pathname: '/bytes',
      headers: { 'content-type': 'application/octet-stream' },
      readBody,
    })

    expect(readBody).toHaveBeenCalledWith('bytes', false)
    expect(result.body).toEqual({ kind: 'bytes', value: new Uint8Array([1, 2, 3]) })
  })

  test('handles route precedence and protocol failures without Fetch globals', async () => {
    const dispatch = createRuntime()

    await expect(dispatch({ request: {}, method: 'GET', pathname: '/users/me' })).resolves.toMatchObject({
      status: 200,
      body: { kind: 'text', value: 'current' },
    })
    await expect(dispatch({ request: {}, method: 'POST', pathname: '/users/me' })).resolves.toMatchObject({
      status: 405,
      headers: { allow: 'GET' },
      body: { kind: 'json', value: { code: 'method-not-allowed' } },
    })
    await expect(dispatch({ request: {}, method: 'GET', pathname: '/missing' })).resolves.toMatchObject({
      status: 404,
      body: { kind: 'json', value: { code: 'route-not-found' } },
    })
    await expect(dispatch({ request: {}, method: 'GET', pathname: '/users/%GG' })).resolves.toMatchObject({
      status: 400,
      body: { kind: 'json', value: { code: 'invalid-path-encoding' } },
    })
  })

  test('lazily compiles encoded-path routing for an otherwise static table', async () => {
    const contract = defineContract({
      routes: { health: route.get('/health', { responses: { 200: response.text() } }) },
    })
    const server = defineServer(contract)
    const dispatch = createWireHandler(server.build({ health: () => ({ status: 200, body: 'ok' }) }))

    await expect(dispatch({ request: {}, method: 'GET', pathname: '/he%61lth' })).resolves.toMatchObject({
      status: 200,
      body: { kind: 'text', value: 'ok' },
    })
  })
})
