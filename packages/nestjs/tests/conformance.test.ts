import type { Server } from 'node:http'
import { fetchTransport } from '@hulla/api/fetch'
import { Module } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { ExpressAdapter } from '@nestjs/platform-express'
import { FastifyAdapter } from '@nestjs/platform-fastify'
import express from 'express'
import { adapterConformance } from '../../../scripts/adapter-conformance'
import { nestAdapter } from '../src'

for (const platform of ['express', 'fastify'] as const) {
  adapterConformance({
    name: `NestJS ${platform}`,
    formData: 'Multipart parsing belongs to Nest interceptors or a platform parser',
    cancellation: true,
    malformedJson: true,
    async open(implementation) {
      class Root {}
      Module({ controllers: [nestAdapter().mount(implementation)] })(Root)
      const native = platform === 'express' ? new ExpressAdapter() : new FastifyAdapter()
      if (native instanceof FastifyAdapter)
        native
          .getInstance()
          .addContentTypeParser('application/octet-stream', { parseAs: 'buffer' }, (_request, body, done) =>
            done(null, body)
          )
      const app = await NestFactory.create(Root, native, { logger: false, abortOnError: false })
      if (platform === 'express') app.use(express.text(), express.raw({ type: 'application/octet-stream' }))
      await app.listen(0, '127.0.0.1')
      const baseUrl = await app.getUrl()
      return {
        transport: fetchTransport({ baseUrl }),
        http: (request) =>
          fetch(new Request(new URL(new URL(request.url).pathname + new URL(request.url).search, baseUrl), request)),
        async close() {
          ;(app.getHttpServer() as Server).closeAllConnections()
          await app.close()
        },
      }
    },
  })
}
