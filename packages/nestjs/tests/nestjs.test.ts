import type { Server } from 'node:http'
import { defineContract, defineErrors, response, route } from '@hulla/api'
import { inProcessTransport } from '@hulla/api/in-process'
import { defineServer } from '@hulla/api/server'
import {
  ForbiddenException,
  Inject,
  Injectable,
  Module,
  Scope,
  SetMetadata,
  UseGuards,
  UseInterceptors,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common'
import { NestFactory, Reflector, REQUEST } from '@nestjs/core'
import { ExpressAdapter } from '@nestjs/platform-express'
import { FastifyAdapter } from '@nestjs/platform-fastify'
import { map } from 'rxjs'
import { describe, expect, expectTypeOf, test } from 'vitest'
import { nestAdapter, type NestContextInput, type NestRequest } from '../src'

for (const platform of ['express', 'fastify'] as const) {
  describe(`NestJS ${platform} native lifecycle`, () => {
    test('runs DI, request scopes, guards, interceptors, route metadata and global prefixes', async () => {
      const calls: string[] = []
      let serviceInstances = 0
      class RequestService {
        readonly id = ++serviceInstances
        constructor(readonly request: NestRequest) {}
      }
      Injectable({ scope: Scope.REQUEST })(RequestService)
      Inject(REQUEST)(RequestService, undefined, 0)
      class AuthGuard {
        canActivate(context: ExecutionContext) {
          const expected = new Reflector().get<string>('permission', context.getHandler())
          calls.push(`guard:${expected}`)
          if (context.switchToHttp().getRequest<NestRequest>().headers['authorization'] !== 'allowed')
            throw new ForbiddenException('denied by Nest')
          return true
        }
      }
      class WrapInterceptor implements NestInterceptor {
        intercept(_context: ExecutionContext, next: CallHandler) {
          calls.push('before')
          return next.handle().pipe(
            map((body: unknown) => {
              calls.push('after')
              return { wrapped: body }
            })
          )
        }
      }
      const contract = defineContract({ routes: { get: route.get('/items', { responses: { 200: response.json() } }) } })
      const adapter = nestAdapter()
      const apiModule = adapter.register(contract, {
        providers: [RequestService],
        inject: [RequestService],
        controllerDecorators: [UseGuards(AuthGuard), UseInterceptors(WrapInterceptor)],
        routeDecorators: () => [SetMetadata('permission', 'read')],
        useFactory: (service: RequestService) =>
          defineServer(contract, {
            context: adapter.context((input) => {
              expectTypeOf(input).toMatchTypeOf<NestContextInput>()
              expect(input.request).toBe(service.request)
              return { id: service.id }
            }),
          }).implement({
            get: ({ context }) => {
              calls.push('handler')
              return { status: 200, body: { id: context.id } }
            },
          }),
      })
      class Root {}
      Module({ imports: [apiModule] })(Root)
      const app = await NestFactory.create(Root, platform === 'express' ? new ExpressAdapter() : new FastifyAdapter(), {
        logger: false,
        abortOnError: false,
      })
      app.setGlobalPrefix('v1')
      await app.listen(0, '127.0.0.1')
      try {
        const url = `${await app.getUrl()}/v1/items`
        const denied = await fetch(url)
        expect(denied.status).toBe(403)
        expect(await denied.json()).toMatchObject({ message: 'denied by Nest' })
        expect(calls).toEqual(['guard:read'])
        calls.length = 0
        const first = await (await fetch(url, { headers: { authorization: 'allowed' } })).json()
        const second = await (await fetch(url, { headers: { authorization: 'allowed' } })).json()
        expect(first.wrapped.id).not.toBe(second.wrapped.id)
        expect(calls).toEqual(['guard:read', 'before', 'handler', 'after', 'guard:read', 'before', 'handler', 'after'])
      } finally {
        ;(app.getHttpServer() as Server).closeAllConnections()
        await app.close()
      }
    })

    test('mounts fragments as native routes and preserves errors, cookies, HEAD and host 404s', async () => {
      const failures = defineErrors({ MISSING: { message: 'missing' } })
      const contract = defineContract({
        errors: { 404: failures.MISSING },
        routes: {
          one: route.get('/one', { responses: { 200: response.text() } }),
          two: route.get('/two', { responses: { 200: response.text() } }),
        },
      })
      const adapter = nestAdapter()
      const server = defineServer(contract, {
        context: adapter.context(({ request }) => ({ denied: request.headers['x-denied'] === 'yes' })),
      })
      const fragment = server.implement(contract.routes.one, ({ context, errors, response }) =>
        context.denied ? errors.MISSING() : response(200, 'one', { 'set-cookie': ['a=1', 'b=2'] })
      )
      expect(() => inProcessTransport(fragment as never)).toThrow('Server requires the nestjs adapter')
      class Root {}
      Module({ controllers: [adapter.mount(fragment)] })(Root)
      const app = await NestFactory.create(Root, platform === 'express' ? new ExpressAdapter() : new FastifyAdapter(), {
        logger: false,
        abortOnError: false,
      })
      await app.listen(0, '127.0.0.1')
      try {
        const origin = await app.getUrl()
        const missing = await fetch(`${origin}/two`)
        expect(missing.status).toBe(404)
        await missing.arrayBuffer()
        const head = await fetch(`${origin}/one`, { method: 'HEAD' })
        expect(head.status).toBe(200)
        expect(await head.text()).toBe('')
        expect(head.headers.getSetCookie()).toEqual(['a=1', 'b=2'])
        const error = await fetch(`${origin}/one`, { headers: { 'x-denied': 'yes' } })
        expect(error.status).toBe(404)
        expect(await error.json()).toMatchObject({ code: 'MISSING' })
      } finally {
        ;(app.getHttpServer() as Server).closeAllConnections()
        await app.close()
      }
    })
  })
}

test('rejects unsupported QUERY routes before native registration', () => {
  const contract = defineContract({ routes: { query: route.query('/query', { responses: { 200: response.text() } }) } })
  expect(() =>
    nestAdapter().mount(defineServer(contract).implement({ query: () => ({ status: 200, body: 'ok' }) }))
  ).toThrow('does not support QUERY')
})
