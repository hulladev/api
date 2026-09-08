import assert from 'node:assert/strict'
import { defineContract, response, route } from '@hulla/api'
import { netlifyFunctionsAdapter, type NetlifyContext } from '@hulla/api-netlify-functions'
import { defineServer } from '@hulla/api/server'
import type { Context } from '@netlify/functions'
const contract = defineContract({ routes: { health: route.get('/health', { responses: { 200: response.text() } }) } })
const adapter = netlifyFunctionsAdapter()
export const handler: (request: Request, context: Context) => Promise<Response> = adapter.mount(
  defineServer(contract, {
    context: adapter.context(({ netlifyContext }) => ({ id: netlifyContext.requestId })),
  }).implement({ health: ({ context }) => ({ status: 200, body: context.id }) })
)
const result = await handler(new Request('http://consumer.test/health'), { requestId: 'consumer' } as NetlifyContext)
assert.equal(result.status, 200)
assert.equal(await result.text(), 'consumer')
