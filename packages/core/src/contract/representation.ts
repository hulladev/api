import type { StandardSchemaV1 } from '@standard-schema/spec'

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue | undefined }

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

/** Type-only JSON declaration; native transports own serialization and parsing. */
export const jsonValueSchema: StandardSchemaV1<JsonValue> = Object.freeze({
  '~standard': Object.freeze({
    version: 1 as const,
    vendor: 'hulla',
    validate: (value: unknown) => ({ value: value as JsonValue }),
    jsonSchema: { input: () => ({}), output: () => ({}) },
  }),
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
