import type { Benchmark } from './harness'
import { assertCreatedUser, createUserInput, createUserOutput, createUserValue, createdUserValue } from './scenario'

/** Lower-bound Fetch implementation without a contract framework. */
const handler = async (request: Request): Promise<Response> => {
  if (request.method !== 'POST' || new URL(request.url).pathname !== '/users') {
    return new Response(null, { status: 404 })
  }

  createUserInput.parse(await request.json())
  const output = createUserOutput.parse(createdUserValue)
  return Response.json(output, { status: 201 })
}

export const directFetchBenchmark: Benchmark = {
  name: 'Direct Fetch',
  async run() {
    const input = createUserInput.parse(createUserValue)
    const response = await handler(
      new Request('https://bench.local/users', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      })
    )
    assertCreatedUser(await response.json())
  },
}
