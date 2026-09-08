import { describe, expect, test, vi } from 'vitest'
import { z } from 'zod'
import { defineContract, response, route } from '../src'
import { createAdapterHandler } from '../src/adapters'
import { fetchAdapter } from '../src/fetch'
import { defineServer } from '../src/server'
import { asyncSchema } from '../src/validation'

describe('adapter execution boundaries', () => {
  test('composes every combination of synchronous and asynchronous stages', async () => {
    for (let mask = 0; mask < 16; mask++) {
      const input = mask & 1 ? asyncSchema(z.string()) : z.string()
      const output = mask & 8 ? asyncSchema(z.string()) : z.string()
      const contract = defineContract({
        routes: {
          execute: route.post('/', { body: input, responses: { 200: response.json(output) } }),
        },
      })
      const context = () => ({ suffix: `-${mask}` })
      const handler = ({ body, context }: { body: string; context: { suffix: string } }) => ({
        status: 200 as const,
        body: body + context.suffix,
      })
      const server = defineServer(contract, { context: mask & 2 ? async () => context() : context })
      const dispatch = createAdapterHandler(
        server.implement({ execute: mask & 4 ? async (input) => handler(input) : handler })
      )
      await expect(
        dispatch({
          request: {},
          method: 'POST',
          pathname: '/',
          body: { value: 'value', contentType: 'application/json' },
        })
      ).resolves.toMatchObject({ status: 200, body: { kind: 'json', value: `value-${mask}` } })
    }
  })

  test.each(['request', 'context', 'handler', 'response'] as const)(
    'preserves %s failures before and after suspension',
    async (failure) => {
      for (const asynchronous of [false, true]) {
        const events: string[] = []
        const input = z.string().superRefine((_value, context) => {
          events.push('request')
          if (failure === 'request') context.addIssue({ code: 'custom', message: 'invalid input' })
        })
        const output = z.string().superRefine((_value, context) => {
          events.push('response')
          if (failure === 'response') context.addIssue({ code: 'custom', message: 'invalid output' })
        })
        const contract = defineContract({
          routes: {
            execute: route.post('/execute', {
              body: asynchronous ? asyncSchema(input) : input,
              responses: { 200: response.json(asynchronous ? asyncSchema(output) : output) },
            }),
          },
        })
        const context = () => {
          events.push('context')
          if (failure === 'context') throw new Error('context failed')
          return { token: 'request-specific' }
        }
        const server = defineServer(contract, { context: asynchronous ? async () => context() : context })
        const handler = ({ body }: { body: string }) => {
          events.push('handler')
          if (failure === 'handler') throw new Error('handler failed')
          return { status: 200 as const, body }
        }
        const onError = vi.fn<(input: { phase: string }) => Promise<void>>(async ({ phase }) => {
          events.push(`error:${phase}`)
        })
        const dispatch = createAdapterHandler(
          server.implement({ execute: asynchronous ? async (input) => handler(input) : handler }),
          { onError }
        )
        const result = dispatch({
          request: {},
          method: 'POST',
          pathname: '/execute',
          body: { value: 'ok', contentType: 'application/json' },
        })
        expect(result).toBeInstanceOf(Promise)
        expect((await result).status).toBe(failure === 'request' ? 400 : 500)
        const phases = ['request', 'context', 'handler', 'response']
        expect(events).toEqual([...phases.slice(0, phases.indexOf(failure) + 1), `error:${failure}`])
        expect(onError).toHaveBeenCalledTimes(1)
      }
    }
  )

  test('aborting during asynchronous context prevents the handler from running', async () => {
    const controller = new AbortController()
    const contract = defineContract({ routes: { execute: route.get('/', { responses: { 200: response.text() } }) } })
    const handler = vi.fn<() => { status: 200; body: string }>(() => ({ status: 200, body: 'ok' }))
    const onError = vi.fn<() => void>()
    const dispatch = createAdapterHandler(
      defineServer(contract, {
        context: async () => {
          await Promise.resolve()
          controller.abort()
          return {}
        },
      }).implement({ execute: handler }),
      { onError }
    )
    await dispatch({ request: {}, method: 'GET', pathname: '/', signal: controller.signal })
    expect(handler).not.toHaveBeenCalled()
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ phase: 'context' }))
  })

  test('public dispatch and Fetch handlers reject invalid inputs through Promises', async () => {
    const contract = defineContract({ routes: { execute: route.get('/', { responses: { 200: response.text() } }) } })
    const implementation = defineServer(contract).implement({ execute: () => ({ status: 200, body: 'ok' }) })
    const dispatch = createAdapterHandler(implementation)
    const fetch = fetchAdapter().mount(implementation)
    await expect(dispatch(null as never)).rejects.toBeInstanceOf(TypeError)
    await expect(fetch(null as never)).rejects.toBeInstanceOf(TypeError)
    expect(dispatch({ request: {}, method: 'GET', pathname: '/' })).toBeInstanceOf(Promise)
    expect(fetch(new Request('https://example.test/'))).toBeInstanceOf(Promise)
  })
})
