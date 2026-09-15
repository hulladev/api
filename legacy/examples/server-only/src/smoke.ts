import assert from 'node:assert/strict'
import { greetings, handler } from './server'

assert.equal(await greetings.normalize('  internal only  '), 'internal only')

const hello = await handler.fetch(
  new Request('https://example.test/api/greetings/hello/Ada', {
    headers: { 'x-request-id': 'request_1' },
  })
)
assert.equal(hello.status, 200)
assert.deepEqual(await hello.json(), {
  message: 'Hello, Ada!',
  requestId: 'request_1',
})

const echo = await handler.fetch(
  new Request('https://example.test/api/greetings/echo', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-request-id': 'request_2',
    },
    body: JSON.stringify({ message: 'Routes use ordinary HTTP.' }),
  })
)
assert.equal(echo.status, 200)
assert.deepEqual(await echo.json(), {
  message: 'Routes use ordinary HTTP.',
  requestId: 'request_2',
})

const internalOverHTTP = await handler.fetch(new Request('https://example.test/api/greetings/normalize'))
assert.equal(internalOverHTTP.status, 404)

console.log('Server-only smoke passed: internal procedures stay private and routes use HTTP.')
