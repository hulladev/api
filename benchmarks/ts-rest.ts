import { initClient, initContract, type ApiFetcher, type AppRouteMutation } from '@ts-rest/core'
import { createFetchHandler, tsr } from '@ts-rest/serverless/fetch'
import type { z } from 'zod'
import type { Benchmark } from './harness'
import { createUserInput, createUserOutput, createUserValue, createdUserValue } from './scenario'

/** ts-rest uses plain contract types here because its stable release peers on Zod 3. */
type CreateUserInput = z.infer<typeof createUserInput>
type CreateUserOutput = z.infer<typeof createUserOutput>

const c = initContract()
const createUserRoute: AppRouteMutation = {
  method: 'POST',
  path: '/users',
  body: c.type<CreateUserInput>(),
  responses: { 201: c.type<CreateUserOutput>() },
}
const contract: { readonly createUser: AppRouteMutation } = {
  createUser: createUserRoute,
}
const router = tsr.router(contract, {
  createUser: async ({ body }) => {
    createUserInput.parse(body)
    return { status: 201, body: createUserOutput.parse(createdUserValue) }
  },
})
const handler = createFetchHandler(contract, router)
const api: ApiFetcher = async ({ path, method, headers, body, validateResponse }) => {
  const response = await handler(
    new Request(path, {
      method,
      headers,
      ...(body === undefined ? {} : { body }),
    })
  )
  const responseBody = await response.json()
  return {
    status: response.status,
    headers: response.headers,
    body: validateResponse ? createUserOutput.parse(responseBody) : responseBody,
  }
}
const client = initClient(contract, {
  baseUrl: 'https://bench.local',
  api,
  validateResponse: true,
})

export const tsRestBenchmark: Benchmark = {
  name: 'ts-rest',
  async run() {
    const input = createUserInput.parse(createUserValue)
    const result = await client.createUser({ body: input, query: undefined })
    if (result.status !== 201) throw new Error('Unexpected benchmark status')
    const output = result.body as CreateUserOutput
    if (output.id !== 'user-1' || output.name !== 'Ada') throw new Error('Unexpected benchmark result')
  },
}
