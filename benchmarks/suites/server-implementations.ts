import { defineContract, response, route } from '@hulla/api'
import { createFetchHandler } from '@hulla/api/fetch'
import { defineServer } from '@hulla/api/server'
import { z } from 'zod'
import type { Benchmark } from '../harness'

const outputSchema = z.object({ index: z.number().int() })
const contract = defineContract({
  routes: {
    route0: route.get('/implementation/0', { responses: { 200: response.json(outputSchema) } }),
    route1: route.get('/implementation/1', { responses: { 200: response.json(outputSchema) } }),
    route2: route.get('/implementation/2', { responses: { 200: response.json(outputSchema) } }),
    route3: route.get('/implementation/3', { responses: { 200: response.json(outputSchema) } }),
  },
})
const server = defineServer(contract)
const middleware = server.middleware(({ next }) => next())
const scopedServer = server.use(contract.routes.route3, middleware)
const handlers = {
  route0: () => ({ status: 200 as const, body: { index: 0 } }),
  route1: () => ({ status: 200 as const, body: { index: 1 } }),
  route2: () => ({ status: 200 as const, body: { index: 2 } }),
  route3: () => ({ status: 200 as const, body: { index: 3 } }),
}

let setupSink: unknown

function retainSetup(value: unknown): void {
  setupSink = value
  if (setupSink !== value) throw new Error('Unable to retain setup result')
}

async function rawHandlerSetup(): Promise<void> {
  const handler = () => ({ status: 200 as const, body: { index: 3 } })
  retainSetup(handler)
}

async function rootImplementationSetup(): Promise<void> {
  retainSetup(createFetchHandler(server.implement(handlers)))
}

async function scopedRootImplementationSetup(): Promise<void> {
  retainSetup(createFetchHandler(scopedServer.implement(handlers)))
}

async function standaloneFragmentSetup(): Promise<void> {
  retainSetup(createFetchHandler(server.implement(contract.routes.route3, handlers.route3)))
}

async function standaloneFragmentsSetup(): Promise<void> {
  retainSetup([
    createFetchHandler(server.implement(contract.routes.route0, handlers.route0)),
    createFetchHandler(server.implement(contract.routes.route1, handlers.route1)),
    createFetchHandler(server.implement(contract.routes.route2, handlers.route2)),
    createFetchHandler(server.implement(contract.routes.route3, handlers.route3)),
  ])
}

async function composedFragmentsSetup(): Promise<void> {
  const route0 = server.implement(contract.routes.route0, handlers.route0)
  const route1 = server.implement(contract.routes.route1, handlers.route1)
  const route2 = server.implement(contract.routes.route2, handlers.route2)
  const route3 = server.implement(contract.routes.route3, handlers.route3)
  retainSetup(createFetchHandler(server.implement(route0, route1, route2, route3)))
}

const rootImplementationFetch = createFetchHandler(server.implement(handlers))
const route0 = server.implement(contract.routes.route0, handlers.route0)
const route1 = server.implement(contract.routes.route1, handlers.route1)
const route2 = server.implement(contract.routes.route2, handlers.route2)
const route3 = server.implement(contract.routes.route3, handlers.route3)
const standaloneFragmentFetch = createFetchHandler(route3)
const composedFragmentsFetch = createFetchHandler(server.implement(route0, route1, route2, route3))
const targetRequest = new Request('https://bench.local/implementation/3')

async function rawHandlerDispatch(): Promise<void> {
  const result = handlers.route3()
  const output = outputSchema.parse(result.body)
  if (result.status !== 200 || output.index !== 3) throw new Error('Unexpected raw handler result')
}

async function dispatch(handler: (request: Request) => Promise<Response>): Promise<void> {
  const result = await handler(targetRequest)
  if (result.status !== 200) throw new Error('Unexpected implementation dispatch result')
}

export const serverImplementationBenchmarks: readonly Benchmark[] = (
  [
    { runtime: 'Direct Fetch - raw route handler', scenario: 'server-implementation-setup', run: rawHandlerSetup },
    {
      runtime: '@hulla/api Root implementation',
      scenario: 'server-implementation-setup',
      run: rootImplementationSetup,
    },
    {
      runtime: '@hulla/api Scoped root implementation',
      scenario: 'server-implementation-setup',
      run: scopedRootImplementationSetup,
    },
    {
      runtime: '@hulla/api Standalone fragment',
      scenario: 'server-implementation-setup',
      run: standaloneFragmentSetup,
    },
    {
      runtime: '@hulla/api Four standalone fragments',
      scenario: 'server-implementation-setup',
      run: standaloneFragmentsSetup,
    },
    {
      runtime: '@hulla/api Composed fragments',
      scenario: 'server-implementation-setup',
      run: composedFragmentsSetup,
    },
    {
      runtime: 'Direct Fetch - raw route handler',
      scenario: 'server-implementation-dispatch',
      run: rawHandlerDispatch,
    },
    {
      runtime: '@hulla/api Root implementation',
      scenario: 'server-implementation-dispatch',
      run: () => dispatch(rootImplementationFetch),
    },
    {
      runtime: '@hulla/api Standalone fragment',
      scenario: 'server-implementation-dispatch',
      run: () => dispatch(standaloneFragmentFetch),
    },
    {
      runtime: '@hulla/api Composed fragments',
      scenario: 'server-implementation-dispatch',
      run: () => dispatch(composedFragmentsFetch),
    },
  ] satisfies readonly Benchmark[]
).map((benchmark) => ({ ...benchmark, profile: 'focused' }))
