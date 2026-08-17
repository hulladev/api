import { defineContract, response, route } from '@hulla/api'
import { defineServer } from '@hulla/api/server'
import { createWireHandler } from '@hulla/api/wire'
import { z } from 'zod'
import type { Benchmark } from './harness'
import { encodeValue } from './scenario'

const routeCount = 256
const targetIndex = routeCount - 1
const targetId = 'item/42'
const adapterRequest = new Request('https://bench.local')
const outputSchema = z.object({ id: z.string(), index: z.number().int() })
const parameterSchema = z.object({ id: z.string() })

const staticRoutes = Object.fromEntries(
  Array.from({ length: routeCount }, (_, index) => [
    `route${index}`,
    route.get(`/static/${index}`, { responses: { 200: response.json(outputSchema) } }),
  ])
)
const staticContract = defineContract({ routes: staticRoutes })
const staticHandlers = Object.fromEntries(
  Array.from({ length: routeCount }, (_, index) => [
    `route${index}`,
    () => ({ status: 200 as const, body: { id: targetId, index } }),
  ])
)
const staticWire = createWireHandler(defineServer(staticContract).build(staticHandlers))

const dynamicRoutes = Object.fromEntries(
  Array.from({ length: routeCount }, (_, index) => [
    `route${index}`,
    route.get(`/dynamic/${index}/:id`, {
      params: parameterSchema,
      responses: { 200: response.json(outputSchema) },
    }),
  ])
)
const dynamicContract = defineContract({ routes: dynamicRoutes })
const dynamicHandlers = Object.fromEntries(
  Array.from({ length: routeCount }, (_, index) => [
    `route${index}`,
    (input: { readonly params: z.output<typeof parameterSchema> }) => ({
      status: 200 as const,
      body: { id: input.params.id, index },
    }),
  ])
)
const dynamicWire = createWireHandler(defineServer(dynamicContract).build(dynamicHandlers))

const directStaticRoutes = new Map(
  Array.from(
    { length: routeCount },
    (_, index) => [`/static/${index}`, () => encodeValue(outputSchema, { id: targetId, index })] as const
  )
)

async function directStaticDispatch(): Promise<void> {
  const handler = directStaticRoutes.get(`/static/${targetIndex}`)
  if (handler === undefined) throw new Error('Missing direct static route')
  const output = outputSchema.parse(handler())
  if (output.index !== targetIndex || output.id !== targetId) throw new Error('Unexpected static route result')
}

async function hullaApiStaticDispatch(): Promise<void> {
  const result = await staticWire({
    request: adapterRequest,
    method: 'GET',
    pathname: `/static/${targetIndex}`,
  })
  if (result.body.kind !== 'json') throw new Error('Unexpected static route representation')
  const output = outputSchema.parse(result.body.value)
  if (output.index !== targetIndex || output.id !== targetId) throw new Error('Unexpected static route result')
}

const directDynamicRoutes = new Map(
  Array.from(
    { length: routeCount },
    (_, index) =>
      [
        String(index),
        (id: string) => encodeValue(outputSchema, { id: parameterSchema.parse({ id }).id, index }),
      ] as const
  )
)

async function directDynamicDispatch(): Promise<void> {
  const pathname = `/dynamic/${targetIndex}/${encodeURIComponent(targetId)}`
  const segments = pathname.slice(1).split('/')
  const handler = directDynamicRoutes.get(segments[1]!)
  if (handler === undefined) throw new Error('Missing direct dynamic route')
  const output = outputSchema.parse(handler(decodeURIComponent(segments[2]!)))
  if (output.index !== targetIndex || output.id !== targetId) throw new Error('Unexpected dynamic route result')
}

async function hullaApiDynamicDispatch(): Promise<void> {
  const result = await dynamicWire({
    request: adapterRequest,
    method: 'GET',
    pathname: `/dynamic/${targetIndex}/${encodeURIComponent(targetId)}`,
  })
  if (result.body.kind !== 'json') throw new Error('Unexpected dynamic route representation')
  const output = outputSchema.parse(result.body.value)
  if (output.index !== targetIndex || output.id !== targetId) throw new Error('Unexpected dynamic route result')
}

export const routeScalingBenchmarks: readonly Benchmark[] = (
  [
    { runtime: 'Direct Fetch', scenario: 'large-static-dispatch', run: directStaticDispatch },
    { runtime: '@hulla/api Wire', scenario: 'large-static-dispatch', run: hullaApiStaticDispatch },
    { runtime: 'Direct Fetch', scenario: 'large-dynamic-dispatch', run: directDynamicDispatch },
    { runtime: '@hulla/api Wire', scenario: 'large-dynamic-dispatch', run: hullaApiDynamicDispatch },
  ] satisfies readonly Benchmark[]
).map((benchmark) => ({ ...benchmark, profile: 'focused' }))
