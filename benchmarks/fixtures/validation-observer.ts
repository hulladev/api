import type { z } from 'zod'
import { validationRejectionMessage } from '../harness/preflight-output'

let rejectedSchema: string | undefined
export function rejectValidation(name?: string): void {
  rejectedSchema = name
}

const counts = new Map<string, number>()
/** Instrumented schemas are created only in the untimed preflight process. */
export function observedSchema<Schema extends z.ZodType>(name: string, schema: Schema): Schema {
  return process.env['BENCH_PREFLIGHT'] === '1'
    ? (schema.superRefine((_value, context) => {
        counts.set(name, (counts.get(name) ?? 0) + 1)
        if (name === rejectedSchema) context.addIssue({ code: 'custom', message: validationRejectionMessage })
      }) as Schema)
    : schema
}
export function resetValidationCounts(): void {
  counts.clear()
}
export function validationCounts(): Readonly<Record<string, number>> {
  return Object.fromEntries(counts)
}
