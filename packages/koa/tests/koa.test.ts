import { createServer } from 'node:http'
import { defineContract, request, response, route } from '@hulla/api'
import { defineServer } from '@hulla/api/server'
import Koa from 'koa'
import { describe, expect, it } from 'vitest'
import { listenConformanceServer } from '../../../scripts/conformance-http'
import { koaAdapter } from '../src'

const contract = defineContract({
  routes: {
    echo: route.post('/echo', { body: request.text(), responses: { 200: response.text() } }),
    health: route.get('/health', { responses: { 200: response.text() } }),
  },
})

describe('Koa native ownership', () => {
  it('preserves typed state, upstream middleware, parsed bodies and HEAD', async () => {
    const app = new Koa<{ actor: string }>()
    const adapter = koaAdapter<{ actor: string }>()
    const implementation = defineServer(contract, {
      context: adapter.context(({ ctx, state }) => ({ actor: state.actor, native: ctx.method })),
    }).implement({
      echo: ({ body, context }) => ({ status: 200, body: `${context.actor}:${body}` }),
      health: ({ context }) => ({ status: 200, body: context.native }),
    })
    app.use(async (ctx, next) => {
      ctx.state.actor = 'Ada'
      if (ctx.method === 'POST') (ctx.request as Koa.Request & { body: unknown }).body = 'parsed'
      await next()
      ctx.set('x-upstream', 'yes')
    })
    app.use(adapter.mount(implementation))
    const host = await listenConformanceServer(createServer(app.callback()))
    try {
      const result = await host.http!(
        new Request('http://test/echo', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'raw' })
      )
      expect(await result.text()).toBe('Ada:parsed')
      expect(result.headers.get('x-upstream')).toBe('yes')
      const head = await host.http!(new Request('http://test/health', { method: 'HEAD' }))
      expect(head.status).toBe(200)
      expect(await head.text()).toBe('')
      expect((await host.http!(new Request('http://test/missing'))).status).toBe(404)
      expect((await host.http!(new Request('http://test/health', { method: 'POST' }))).status).toBe(405)
    } finally {
      await host.close()
    }
  })

  it('enforces configured body limits', async () => {
    const app = new Koa()
    app.use(
      koaAdapter({ maxBodyBytes: 2 }).mount(
        defineServer(contract).implement({
          echo: ({ body }) => ({ status: 200, body }),
          health: () => ({ status: 200, body: 'ok' }),
        })
      )
    )
    const host = await listenConformanceServer(createServer(app.callback()))
    try {
      expect(
        (
          await host.http!(
            new Request('http://test/echo', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'long' })
          )
        ).status
      ).toBe(413)
    } finally {
      await host.close()
    }
  })
})
