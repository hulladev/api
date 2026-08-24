import type { StandardSchemaV1 } from '@standard-schema/spec'

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue | undefined }

function isJsonValue(value: unknown, ancestors = new Set<object>()): value is JsonValue {
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

function identitySchema<const Value>(definition: {
  readonly name: string
  readonly check: (value: unknown) => value is Value
  readonly jsonSchema?: Readonly<Record<string, unknown>>
}): StandardSchemaV1<Value> {
  return Object.freeze({
    '~standard': Object.freeze({
      version: 1 as const,
      vendor: 'hulla',
      validate: (value: unknown): StandardSchemaV1.Result<Value> =>
        definition.check(value) ? { value } : { issues: [{ message: `Expected ${definition.name}` }] },
      ...(definition.jsonSchema === undefined
        ? {}
        : {
            jsonSchema: {
              input: () => definition.jsonSchema!,
              output: () => definition.jsonSchema!,
            },
          }),
    }),
  })
}

export const jsonValueSchema = /* @__PURE__ */ identitySchema({
  name: 'a JSON value',
  check: isJsonValue,
  jsonSchema: {},
})

export const stringSchema = /* @__PURE__ */ identitySchema({
  name: 'a string',
  check: (value: unknown): value is string => typeof value === 'string',
  jsonSchema: { type: 'string' },
})

export const bytesSchema = /* @__PURE__ */ identitySchema({
  name: 'a Uint8Array',
  check: (value: unknown): value is Uint8Array => value instanceof Uint8Array,
})

export const formDataSchema = /* @__PURE__ */ identitySchema({
  name: 'FormData',
  check: (value: unknown): value is FormData => value instanceof FormData,
})
