import type { NamedProcedureInputTupleSchema, ProcedureInputTupleSchema, Schema } from './types.public'

export function inputTupleSchema<const Schemas extends readonly [Schema, Schema, ...Schema[]]>(
  schemas: Schemas
): ProcedureInputTupleSchema<Schemas> {
  return {
    'hulla.api.inputSchemas': schemas,
    parse(value) {
      const args = value as readonly unknown[]
      if (args.length > schemas.length)
        throw new TypeError(`Expected at most ${schemas.length} procedure input arguments, received ${args.length}.`)
      return schemas.map((schema, index) => schema.parse(args[index])) as never
    },
    _input: undefined as never,
    _output: undefined as never,
  }
}

export function isInputTupleSchema(value: unknown): value is ProcedureInputTupleSchema {
  return (
    typeof value === 'object' &&
    value !== null &&
    Array.isArray((value as Partial<ProcedureInputTupleSchema>)['hulla.api.inputSchemas'])
  )
}

export function namedInputTupleSchema<const Schemas extends readonly [Schema, ...(Schema | undefined)[]]>(
  schemas: readonly Schema[]
): NamedProcedureInputTupleSchema<Schemas> {
  return {
    ...inputTupleSchema(schemas as readonly [Schema, Schema, ...Schema[]]),
    'hulla.api.namedInputSchemas': schemas as unknown as Schemas,
  } as unknown as NamedProcedureInputTupleSchema<Schemas>
}
