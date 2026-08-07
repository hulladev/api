import { defineSchema } from './validation'

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue | undefined }

export function isJsonValue(value: unknown, ancestors = new Set<object>()): value is JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value !== 'object') return false

  if (ancestors.has(value)) return false
  ancestors.add(value)

  const valid = Array.isArray(value)
    ? value.every((item) => isJsonValue(item, ancestors))
    : (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null) &&
      Object.values(value).every((item) => isJsonValue(item, ancestors))

  ancestors.delete(value)
  return valid
}

export const jsonValueSchema = /* @__PURE__ */ defineSchema({
  name: 'a JSON value',
  check: isJsonValue,
})

export const stringSchema = /* @__PURE__ */ defineSchema({
  name: 'a string',
  check: (value: unknown): value is string => typeof value === 'string',
})

export const bytesSchema = /* @__PURE__ */ defineSchema({
  name: 'a Uint8Array',
  check: (value: unknown): value is Uint8Array => value instanceof Uint8Array,
})

export const formDataSchema = /* @__PURE__ */ defineSchema({
  name: 'FormData',
  check: (value: unknown): value is FormData => value instanceof FormData,
})
