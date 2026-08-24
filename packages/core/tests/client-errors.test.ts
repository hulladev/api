import { describe, expect, test } from 'vitest'
import { isAPIError } from '../src'
import { ClientResponseError } from '../src/client'
import { fetchTransport } from '../src/fetch'

describe('client transport errors', () => {
  test('uses the shared structured API error convention', () => {
    const response = { status: 418, headers: {}, readBody: () => undefined }
    const error = new ClientResponseError('unexpected-status', response, 'Unexpected response status')

    expect(isAPIError(error)).toBe(true)
    expect(error).toMatchObject({
      code: 'unexpected-status',
      response,
      issues: [{ code: 'unexpected-status', location: 'response' }],
    })
  })

  test('explains relative Fetch URLs in runtimes without a document base URL', () => {
    const transport = fetchTransport()

    expect(() =>
      transport({
        key: ['health'],
        method: 'GET',
        path: '/api/health',
        headers: {},
      })
    ).toThrow('configure an absolute baseUrl for Node.js or SSR')
  })
})
