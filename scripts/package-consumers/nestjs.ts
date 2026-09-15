import assert from 'node:assert/strict'
import type { Server } from 'node:http'
import { defineContract, response, route } from '@hulla/api'
import { nestAdapter, type NestRequest } from '@hulla/api-nestjs'
import { defineServer } from '@hulla/api/server'
import { Injectable, Inject, Module, Scope } from '@nestjs/common'
import { NestFactory, REQUEST } from '@nestjs/core'
import { ExpressAdapter } from '@nestjs/platform-express'
import { FastifyAdapter } from '@nestjs/platform-fastify'
const contract = defineContract({ routes: { health: route.get('/health', { responses: { 200: response.text() } }) } })
class ActorService {
  constructor(readonly request: NestRequest) {}
}
Injectable({ scope: Scope.REQUEST })(ActorService)
Inject(REQUEST)(ActorService, undefined, 0)
export function createModule() {
  const adapter = nestAdapter()
  return adapter.register(contract, {
    providers: [ActorService],
    inject: [ActorService],
    useFactory: (service: ActorService) =>
      defineServer(contract, {
        context: adapter.context(({ request }) => {
          assert.equal(request, service.request)
          return { actor: String(request.headers['x-actor']) }
        }),
      }).implement({ health: ({ context }) => ({ status: 200, body: context.actor }) }),
  })
}
for (const native of [new ExpressAdapter(), new FastifyAdapter()]) {
  class Root {}
  Module({ imports: [createModule()] })(Root)
  const app = await NestFactory.create(Root, native, { logger: false, abortOnError: false })
  await app.listen(0, '127.0.0.1')
  try {
    for (const actor of ['first', 'second']) {
      const response = await fetch(`${await app.getUrl()}/health`, { headers: { 'x-actor': actor } })
      assert.equal(response.status, 200)
      assert.equal(await response.text(), actor)
    }
  } finally {
    ;(app.getHttpServer() as Server).closeAllConnections()
    await app.close()
  }
}
