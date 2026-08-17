import { describe, expect, test, vi } from 'vitest'
import { z } from 'zod'
import { compileContract, defineContract, response, route } from '../src'
import { defineClient } from '../src/client'
import { compileContractRoutes } from '../src/contract-compiler'
import { getContractState } from '../src/contract-state'
import { createFetchHandler, defineServer } from '../src/server'

describe('runtime fast paths', () => {
  test('constructs an option-free GET request without a RequestInit object', async () => {
    const contract = defineContract({
      routes: { health: route.get('/health', { responses: { 200: response.text(z.literal('ok')) } }) },
    })
    const NativeRequest = globalThis.Request
    const calls: (RequestInit | undefined)[] = []
    class RecordingRequest extends NativeRequest {
      constructor(input: RequestInfo | URL, init?: RequestInit) {
        calls.push(init)
        super(input, init)
      }
    }
    vi.stubGlobal('Request', RecordingRequest)

    try {
      const client = defineClient(contract, {
        baseUrl: 'https://api.example.com',
        fetch: async () => new Response('ok', { headers: { 'content-type': 'text/plain' } }),
      }).build()

      await expect(client.health()).resolves.toMatchObject({ status: 200, body: 'ok' })
      expect(calls).toEqual([undefined])
    } finally {
      vi.unstubAllGlobals()
    }
  })

  test('uses the platform JSON response constructor for JSON wire values', async () => {
    const contract = defineContract({
      routes: { health: route.get('/health', { responses: { 200: response.json(z.object({ ok: z.boolean() })) } }) },
    })
    const handler = createFetchHandler(
      defineServer(contract).build({ health: () => ({ status: 200, body: { ok: true } }) })
    )
    const json = vi.spyOn(Response, 'json')

    try {
      const result = await handler(new Request('https://api.example.com/health'))
      expect(await result.json()).toEqual({ ok: true })
      expect(json).toHaveBeenCalledOnce()
    } finally {
      json.mockRestore()
    }
  })

  test.each(['text/plain;charset=utf-8', 'Text/Plain ; Charset=UTF-8'])(
    'accepts equivalent response content type %s',
    async (contentType) => {
      const contract = defineContract({
        routes: { health: route.get('/health', { responses: { 200: response.text(z.literal('ok')) } }) },
      })
      const client = defineClient(contract, {
        baseUrl: 'https://api.example.com',
        fetch: async () => new Response('ok', { headers: { 'content-type': contentType } }),
      }).build()

      await expect(client.health()).resolves.toMatchObject({ status: 200, body: 'ok' })
    }
  )
})

describe('contract route compilation', () => {
  test('reuses route metadata emitted while defining the contract', () => {
    const contract = defineContract({
      routes: { health: route.get('/health', { responses: { 200: response.text() } }) },
    })
    const definedRoutes = getContractState(contract).routes

    expect(definedRoutes).toBeDefined()
    expect(compileContractRoutes(contract)).toBe(definedRoutes)
    expect(compileContract(contract).routes).toBe(definedRoutes)
  })
})
