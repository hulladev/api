import { defineContract, response, route } from '@hulla/api'
import { defineClient } from '@hulla/api/client'
import { createFetchHandler, defineServer } from '@hulla/api/server'
import type { Benchmark } from './harness'
import { createUserInput, createUserOutput, createUserValue, createdUserValue } from './scenario'

const contract = defineContract({
  routes: {
    createUser: route.post('/users', {
      body: createUserInput,
      responses: { 201: response.json(createUserOutput) },
    }),
  },
})

const server = defineServer(contract)
const handler = createFetchHandler(
  server.build(server.implement({ createUser: (actions) => actions.respond({ status: 201, body: createdUserValue }) }))
)
const client = defineClient(contract, { baseUrl: 'https://bench.local', fetch: handler }).build()

export const hullaBenchmark: Benchmark = {
  name: 'Hulla',
  async run() {
    const result = await client.createUser({ body: createUserValue })
    if (result.status !== 201 || result.body.id !== 'user-1') throw new Error('Unexpected benchmark result')
  },
}
