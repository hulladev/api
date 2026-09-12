import assert from 'node:assert/strict'
import { defineContract, response, route } from '@hulla/api'
import { createClient } from '@hulla/api-control'

const contract = defineContract({
  routes: { health: route.get('/health', { responses: { 200: response.text(), 409: response.text() } }) },
})
const client = createClient(contract, {
  transport: () => ({ status: 409, headers: { 'content-type': 'text/plain' }, readBody: () => 'Conflict' }),
})
const result = await client.health()
assert(result.isErr())
assert.equal(result.error.kind, 'http')
if (result.error.kind === 'http') {
  const status: 409 = result.error.response.status
  assert.equal(status, 409)
  assert.equal(result.error.response.body, 'Conflict')
}
