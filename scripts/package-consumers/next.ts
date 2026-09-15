import assert from 'node:assert/strict'
import { defineContract, response, route } from '@hulla/api'
import { nextAdapter } from '@hulla/api-next/server'
import { defineServer } from '@hulla/api/server'
import { NextRequest } from 'next/server.js'
const contract = defineContract({ routes: { health: route.get('/health', { responses: { 200: response.text() } }) } })
const adapter = nextAdapter()
export const handler = adapter.mount(
  defineServer(contract, { context: adapter.context(({ request }) => ({ path: request.nextUrl.pathname })) }).implement(
    { health: ({ context }) => ({ status: 200, body: context.path }) }
  )
)
const result = await handler(new NextRequest('http://consumer.test/health'), { params: Promise.resolve({}) })
assert.equal(result.status, 200)
assert.equal(await result.text(), '/health')
