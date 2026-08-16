import { describe, expect, test } from 'vitest'
import { defineContract, response, route } from '../src'
import { defineClient } from '../src/client'
import { defineServer } from '../src/server'
import { createFetchHandler } from '../src/server'

describe('@hulla/api Fetch runtime', () => {
  test('adapts a Fetch round trip to the wire executor', async () => {
    const contract = defineContract({
      routes: { health: route.get('/health', { responses: { 200: response.json() } }) },
    })
    const server = defineServer(contract)
    const implementation = server.build(
      server.implement({ health: (actions) => actions.respond({ status: 200, body: { ok: true } }) })
    )
    const handler = createFetchHandler(implementation)
    const client = defineClient(contract, { baseUrl: 'https://api.example.com', fetch: handler }).build()

    await expect(client.health()).resolves.toMatchObject({ status: 200, body: { ok: true } })
  })
})
