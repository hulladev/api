import { describe, expect, expectTypeOf, test } from 'vitest'
import { procedureBuilder } from '../src/procedure'
import type { HandlerBuilder, InputBuilder, OutputBuilder, UseBuilder } from '../src/types.private'

describe('procedure syntax', () => {
  const noMiddleware = procedureBuilder({ middleware: {}, settings: { output: 'raw' as const } })
  const withMiddleware = procedureBuilder({ middleware: { foo: () => 'foo' }, settings: { output: 'raw' as const } })

  const expectAlwaysAvailable = (builder: typeof noMiddleware | typeof withMiddleware) => {
    expect(builder).toHaveProperty('input')
    expect(builder).toHaveProperty('output')
    expect(builder).toHaveProperty('handler')
  }

  test('noMiddleware has all methods available', () => {
    expectAlwaysAvailable(noMiddleware)
    expectTypeOf(noMiddleware.input).toEqualTypeOf<
      InputBuilder<{}, undefined, undefined, undefined, undefined, { output: 'raw' }>
    >()
    expectTypeOf(noMiddleware.output).toEqualTypeOf<
      OutputBuilder<{}, undefined, undefined, undefined, undefined, { output: 'raw' }>
    >()
    expectTypeOf(noMiddleware.handler).toEqualTypeOf<
      HandlerBuilder<{}, undefined, undefined, undefined, undefined, undefined, { output: 'raw' }>
    >()
  })
  test('use is not available when no middleware is passed', () => {
    expect(noMiddleware).not.toHaveProperty('use')
    // @ts-expect-error use is not available when no middleware is passed
    expectTypeOf(noMiddleware.use).toEqualTypeOf<never>()
  })

  test('shared methods are available also with middleware', () => {
    expectAlwaysAvailable(withMiddleware)
    expectTypeOf(withMiddleware.input).toEqualTypeOf<
      InputBuilder<{ readonly foo: () => string }, undefined, undefined, undefined, undefined, { output: 'raw' }>
    >()
    expectTypeOf(withMiddleware.output).toEqualTypeOf<
      OutputBuilder<{ readonly foo: () => string }, undefined, undefined, undefined, undefined, { output: 'raw' }>
    >()
    expectTypeOf(withMiddleware.handler).toEqualTypeOf<
      HandlerBuilder<
        { readonly foo: () => string },
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        { output: 'raw' }
      >
    >()
  })
  test('use is available when middleware is passed', () => {
    expect(withMiddleware).toHaveProperty('use')
    expectTypeOf(withMiddleware.use).toEqualTypeOf<
      UseBuilder<{ readonly foo: () => string }, undefined, undefined, undefined, undefined, { output: 'raw' }>
    >()
  })
})
