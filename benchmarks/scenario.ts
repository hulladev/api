import { z } from 'zod'

export const benchmarkScenarios = Object.freeze({
  'static-get': 'Static JSON GET with server and client output validation',
  'small-json-post': 'Small JSON POST with client/server input and output validation',
  'large-json-post': 'Large JSON POST with client/server input and output validation',
  'cold-first-call': 'Loaded-module application construction plus the first validated request',
  'wire-dispatch': 'Server adapter dispatch with a host-parsed JSON body',
  'large-static-dispatch': 'Static route dispatch through a 256-route server',
  'large-dynamic-dispatch': 'Parameterized route dispatch through a 256-route server',
  'dynamic-http': 'Dynamic path, query, and header transport with validation at both boundaries',
  'middleware-context': 'Client and server context plus one middleware layer',
  'validation-failure': 'Invalid server request validation and protocol error serialization',
  'codec-roundtrip': 'Transformed Date codec at all four client/server boundaries',
  streaming: 'Ten NDJSON chunks with server encoding and client decoding validation',
})

export type BenchmarkScenario = keyof typeof benchmarkScenarios

/** Shared wire schemas and values used by every implementation. */
export const healthOutput = z.object({ ok: z.boolean() })
export const healthValue = Object.freeze({ ok: true })
export const createUserInput = z.object({ name: z.string().min(1) })
export const createUserOutput = z.object({ id: z.string(), name: z.string() })
export const createUserValue = Object.freeze({ name: 'Ada' })
export const createdUserValue = Object.freeze({ id: 'user-1', name: 'Ada' })
const largeItem = z.object({ id: z.number().int(), label: z.string(), active: z.boolean() })
export const largeInput = z.object({ items: z.array(largeItem) })
export const largeOutput = z.object({ count: z.number().int(), items: z.array(largeItem) })
export const largeValue = {
  items: Array.from({ length: 100 }, (_, id) => ({ id, label: `item-${id}`, active: id % 2 === 0 })),
}
export const largeResult = { count: largeValue.items.length, items: largeValue.items }

/** Validates an identity schema at an outgoing boundary without invoking codec machinery. */
export function encodeValue<const Schema extends z.ZodType>(schema: Schema, value: z.output<Schema>): z.input<Schema> {
  return schema.parse(value) as z.input<Schema>
}

export function assertHealth(value: unknown): void {
  if (!healthOutput.parse(value).ok) throw new Error('Unexpected health result')
}

export function assertCreatedUser(value: unknown): void {
  const result = createUserOutput.parse(value)
  if (result.id !== 'user-1' || result.name !== 'Ada') throw new Error('Unexpected benchmark result')
}

export function assertLarge(value: unknown): void {
  const result = largeOutput.parse(value)
  if (result.count !== largeValue.items.length || result.items[99]?.id !== 99) {
    throw new Error('Unexpected large benchmark result')
  }
}
