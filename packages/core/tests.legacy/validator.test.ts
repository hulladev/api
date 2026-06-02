import { describe, expect, expectTypeOf, test } from 'vitest'
import { z } from 'zod'
import { api } from '../src/api'
import { createValidator, defaultValidator } from '../src/helpers/validator'
import type { SchemaInput, SchemaOutput } from '../src/types'

type ExampleSchema<Input, Output> = {
  parse: (input: Input) => Output
  _input: Input
  _output: Output
}

function createSchema<Input, Output>(parse: (input: Input) => Output): ExampleSchema<Input, Output> {
  return {
    parse,
    _input: undefined as Input,
    _output: undefined as Output,
  }
}

const exampleValidator = <Schema extends ExampleSchema<any, any>>(schema: Schema) => schema.parse

const exampleSchema = {
  string: () =>
    createSchema((input: unknown) => {
      if (typeof input !== 'string') {
        throw new Error('Expected string')
      }

      return input
    }),
  objectLength: () =>
    createSchema((input: string) => ({
      size: input.length,
    })),
  fixedNumberString: () => createSchema((input: number) => input.toFixed(2)),
}

describe('createValidator', () => {
  test('returns the default validator when no custom validator is provided', () => {
    const validator = createValidator()
    const schema = z.string().transform((value) => value.length)

    expect(validator).toBe(defaultValidator)
    expect(validator(schema)('hulla')).toBe(5)
    if (false as never) {
      // @ts-expect-error zod input is string
      validator(schema)(123)
    }
    expectTypeOf<SchemaInput<typeof schema>>().toEqualTypeOf<string>()
    expectTypeOf<SchemaOutput<typeof schema>>().toEqualTypeOf<number>()
    expectTypeOf(validator(schema)).toEqualTypeOf<(input: string) => number>()
  })

  test('returns the provided custom validator unchanged', () => {
    const validator = createValidator(exampleValidator)
    const schema = exampleSchema.objectLength()
    const parse = validator(schema)
    const typedParse: (input: string) => { size: number } = parse
    const parsed: { size: number } = parse('abcd')

    expect(validator).toBe(exampleValidator)
    expect(parsed).toStrictEqual({ size: 4 })
    expectTypeOf<SchemaInput<typeof schema>>().toEqualTypeOf<string>()
    expectTypeOf<SchemaOutput<typeof schema>>().toEqualTypeOf<{ size: number }>()
    expect(typedParse('xy')).toStrictEqual({ size: 2 })
  })
})

describe('api validators', () => {
  test('resolves the default validator on api metadata', () => {
    const instance = api()
    const schema = z.string().transform((value) => value.length)
    const parse: (input: string) => number = instance.$meta.validator(schema)

    expect(instance.$meta.validator).toBe(defaultValidator)
    expect(parse('hello')).toBe(5)
  })

  test('preserves custom validator types on api metadata', () => {
    const instance = api({ validator: exampleValidator })
    const schema = exampleSchema.fixedNumberString()
    const parse = instance.$meta.validator(schema)
    const typedValidator: typeof exampleValidator = instance.$meta.validator
    const typedParse: (input: number) => string = parse
    const parsed: string = parse(2)

    expect(typedValidator).toBe(exampleValidator)
    expect(parsed).toBe('2.00')
    expect(typedParse(3)).toBe('3.00')
  })

  test('supports custom schemas that hide phantom types behind factory helpers', () => {
    const instance = api({ validator: exampleValidator })
    const schema = exampleSchema.string()
    const parse = instance.$meta.validator(schema)

    expect(parse('hello')).toBe('hello')
    expect(() => parse(123 as never)).toThrow('Expected string')
    expectTypeOf<SchemaInput<typeof schema>>().toEqualTypeOf<unknown>()
    expectTypeOf<SchemaOutput<typeof schema>>().toEqualTypeOf<string>()
  })

  test('surfaces runtime errors from custom validators for invalid input', () => {
    const instance = api({ validator: exampleValidator })
    const schema = exampleSchema.string()
    const parse = instance.$meta.validator(schema)

    expect(() => parse(false as never)).toThrow('Expected string')
  })
})
