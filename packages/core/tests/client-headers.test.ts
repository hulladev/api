import { expect, test } from 'vitest'
import { z } from 'zod'
import { defineContract, response, route } from '../src'
import { createClient, type ClientTransportRequest } from '../src/client'
import { codec } from '../src/validation'

const headers = z.record(z.string(), z.string().optional())
const emptyResponse = { status: 204, headers: {}, readBody: () => undefined }

test('merges header sources in order, including removals and prototype-named fields', async () => {
  const contract = defineContract({
    routes: { call: route.get('/', { headers, responses: { 204: response.empty() } }) },
  })
  const requests: ClientTransportRequest[] = []
  const client = createClient(contract, {
    headers: { 'X-Token': 'configured', 'X-Remove': 'configured' },
    transport: (request) => {
      requests.push(request)
      return emptyResponse
    },
  })
  const values = Object.freeze(
    JSON.parse('{"X-Token":"route","x-token":"last","x-remove":null,"__proto__":"safe","constructor":"text"}')
  )
  const input = { ...values, 'x-remove': undefined }
  await client.call({ headers: input }, { headers: { 'x-token': 'options', 'x-extra': 'option' } })
  const first = requests[0]!.headers
  expect(first['x-token']).toBe('last')
  expect(first['x-extra']).toBe('option')
  expect(Object.hasOwn(first, 'x-remove')).toBe(false)
  expect(Object.hasOwn(first, '__proto__')).toBe(true)
  expect(first['__proto__']).toBe('safe')
  expect(first['constructor']).toBe('text')
  expect(Object.getPrototypeOf(first)).toBe(Object.prototype)
  first['x-token'] = 'mutated'
  await client.call({ headers: input })
  expect(requests[1]!.headers['x-token']).toBe('last')
  expect(input['X-Token']).toBe('route')
})

test('snapshots route header getters before an asynchronous body finishes', async () => {
  let release!: () => void
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  const body = codec(z.string(), z.string(), {
    decode: (value) => value,
    encode: async (value) => {
      await pending
      return value
    },
  })
  const contract = defineContract({
    routes: { call: route.post('/', { body, headers, responses: { 204: response.empty() } }) },
  })
  const requests: ClientTransportRequest[] = []
  const client = createClient(contract, {
    transport: (request) => {
      requests.push(request)
      return emptyResponse
    },
  })
  let value = 'original'
  let reads = 0
  const routeHeaders = {
    get 'X-Value'() {
      reads++
      return value
    },
  }
  const result = client.call({ body: 'body', headers: routeHeaders })
  expect(reads).toBe(1)
  value = 'changed'
  release()
  await result
  expect(requests[0]!.headers['x-value']).toBe('original')
  expect(reads).toBe(1)
})

test('validates asynchronously encoded header values before transport', async () => {
  let sent = false
  const encodedHeaders = codec(headers, headers, {
    decode: (value) => value,
    encode: async () => ({ 'X-Invalid': 42 }) as never,
  })
  const contract = defineContract({
    routes: { call: route.get('/', { headers: encodedHeaders, responses: { 204: response.empty() } }) },
  })
  const client = createClient(contract, {
    transport: () => {
      sent = true
      return emptyResponse
    },
  })
  await expect(client.call({ headers: {} })).rejects.toThrow(/expected string/i)
  expect(sent).toBe(false)
})
