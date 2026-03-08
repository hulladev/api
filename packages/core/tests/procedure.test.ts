// @ts-check
import { describe, expect, expectTypeOf, test } from 'vitest'
import { z } from 'zod'
import { procedure } from '../src/procedure'

const context = { foo: 'foo' } as const
const parseKey = 'parse'
const p = procedure({ context, parseKey, group: 'procedure', defaultMethod: 'call', defaultContext: context })

/**
 * these tests focus on the user-DX of having correct chains available
 */
describe('procedure chaining', () => {
  const px = p('hello')
  test('top level', () => {
    expect(px.define).toBeTypeOf('function')
    expect(px.input).toBeTypeOf('function')
    expect(px.output).toBeTypeOf('function')
  })
  test('direct define', () => {
    const direct = px.define(() => 'foo')
    // @ts-expect-error intentional bad call
    expect(direct.define).toBeUndefined()
    // @ts-expect-error intentional bad call
    expect(direct.input).toBeUndefined()
    // @ts-expect-error intentional bad call
    expect(direct.output).toBeUndefined()
  })
  test('input chains', () => {
    // top level input chains:
    const pi = px.input((id: string) => id)
    // @ts-expect-error intentional bad call
    expect(pi.input).toBeUndefined()
    expect(pi.define).toBeTypeOf('function')
    expect(pi.output).toBeTypeOf('function')
    // now input -> output chain
    const pio = pi.output(() => 2)
    expect(pio.define).toBeTypeOf('function')
    // @ts-expect-error intentional bad call
    expect(pio.input).toBeUndefined()
    // @ts-expect-error intentional bad call
    expect(pio.output).toBeUndefined()
  })
  test('output chains', () => {
    //top level output chains
    const po = px.output((x: number) => x)
    expect(po.define).toBeTypeOf('function')
    expect(po.input).toBeTypeOf('function')
    // @ts-expect-error intentional bad call
    expect(po.output).toBeUndefined()
    // now output -> input chain
    const poi = po.input((id: string) => id)
    expect(poi.define).toBeTypeOf('function')
    // @ts-expect-error intentional bad call
    expect(poi.input).toBeUndefined()
    // @ts-expect-error intentional bad call
    expect(poi.output).toBeUndefined()
  })
})

/**
 * these tests focus on the baisc calls having correct types and values
 */
describe('types and values', () => {
  const px = p('test')
  test('top level', () => {
    const pd = px.define(() => null)
    expect(pd.name).toStrictEqual('test')
    expectTypeOf(pd.name).toEqualTypeOf<'test'>()
    expect(pd.method).toStrictEqual('call')
    expectTypeOf(pd.method).toEqualTypeOf<'call'>()
    expect(pd.fn()).toBeNull()
    expectTypeOf(pd.fn()).toEqualTypeOf<null>()
  })
  test('input', () => {
    // top level input chain
    const pi = px.input((num: number) => num)
    const pd = pi.define(({ input }) => input.toString())
    expect(pd.name).toStrictEqual('test')
    expectTypeOf(pd.name).toEqualTypeOf<'test'>()
    expect(pd.method).toStrictEqual('call')
    expectTypeOf(pd.method).toEqualTypeOf<'call'>()
    expect(pd.fn(2)).toStrictEqual('2')
    expectTypeOf(pd.fn(2)).toEqualTypeOf<string>()
    // nested input chain
    const pio = pi.output((bool: boolean) => !!bool)
    const pd2 = pio.define(({ input }) => !!input)
    expect(pd2.name).toStrictEqual('test')
    expectTypeOf(pd2.name).toEqualTypeOf<'test'>()
    expect(pd2.method).toStrictEqual('call')
    expectTypeOf(pd2.method).toEqualTypeOf<'call'>()
    expect(pd2.fn(2)).toStrictEqual(true)
    expectTypeOf(pd2.fn(2)).toEqualTypeOf<boolean>()
  })
  test('output', () => {
    // top level output chain
    const po = px.output((num: number) => num)
    const pd = po.define(() => 2)
    expect(pd.name).toStrictEqual('test')
    expectTypeOf(pd.name).toEqualTypeOf<'test'>()
    expect(pd.method).toStrictEqual('call')
    expectTypeOf(pd.method).toEqualTypeOf<'call'>()
    expect(pd.fn()).toStrictEqual(2)
    expectTypeOf(pd.fn()).toEqualTypeOf<number>()
    // nested output chain
    const poi = po.input((bool: boolean) => !!bool)
    const pd2 = poi.define(({ input }) => +input)
    expect(pd2.name).toStrictEqual('test')
    expectTypeOf(pd2.name).toEqualTypeOf<'test'>()
    expect(pd2.method).toStrictEqual('call')
    expectTypeOf(pd2.method).toEqualTypeOf<'call'>()
    expect(pd2.fn(true)).toStrictEqual(1)
    expectTypeOf(pd2.fn(true)).toEqualTypeOf<number>()
  })
  test('schemas', () => {
    const pi = px.input(z.number())
    const pd = pi.define(({ input }) => input.toString())
    expect(pd.name).toStrictEqual('test')
    expectTypeOf(pd.name).toEqualTypeOf<'test'>()
    expect(pd.method).toStrictEqual('call')
    expectTypeOf(pd.method).toEqualTypeOf<'call'>()
    expect(pd.fn(2)).toStrictEqual('2')
    expectTypeOf(pd.fn(2)).toEqualTypeOf<string>()
    const po = px.output(z.number())
    const pd2 = po.define(() => 2)
    expect(pd2.name).toStrictEqual('test')
    expectTypeOf(pd2.name).toEqualTypeOf<'test'>()
    expect(pd2.method).toStrictEqual('call')
    expectTypeOf(pd2.method).toEqualTypeOf<'call'>()
    expect(pd2.fn()).toStrictEqual(2)
    expectTypeOf(pd2.fn()).toEqualTypeOf<number>()
    const pio = pi.output(z.boolean())
    const pd3 = pio.define(({ input }) => !!input)
    expect(pd3.name).toStrictEqual('test')
    expectTypeOf(pd3.name).toEqualTypeOf<'test'>()
    expect(pd3.method).toStrictEqual('call')
    expectTypeOf(pd3.method).toEqualTypeOf<'call'>()
    expect(pd3.fn(2)).toStrictEqual(true)
    expectTypeOf(pd3.fn(2)).toEqualTypeOf<boolean>()
    const poi = po.input(z.boolean())
    const pd4 = poi.define(({ input }) => +input)
    expect(pd4.name).toStrictEqual('test')
    expectTypeOf(pd4.name).toEqualTypeOf<'test'>()
    expect(pd4.method).toStrictEqual('call')
    expectTypeOf(pd4.method).toEqualTypeOf<'call'>()
    expect(pd4.fn(true)).toStrictEqual(1)
    expectTypeOf(pd4.fn(true)).toEqualTypeOf<number>()
  })
})

/**
 * tests targetting method definitions
 */
describe('method overrides', () => {
  test('method override', () => {
    const pd = p('test', 'get').define(() => null)
    expect(pd.method).toStrictEqual('get')
    expectTypeOf(pd.method).toEqualTypeOf<'get'>()
    const pi = p('test', 'get').input((num: number) => num)
    const pd2 = pi.define(({ input }) => input.toString())
    expect(pd2.method).toStrictEqual('get')
    expectTypeOf(pd2.method).toEqualTypeOf<'get'>()
    const po = p('test', 'get').output((num: number) => num)
    const pd3 = po.define(() => 2)
    expect(pd3.method).toStrictEqual('get')
    expectTypeOf(pd3.method).toEqualTypeOf<'get'>()
    const pio = pi.output(z.boolean())
    const pd4 = pio.define(({ input }) => !!input)
    expect(pd4.method).toStrictEqual('get')
    expectTypeOf(pd4.method).toEqualTypeOf<'get'>()
    const poi = po.input(z.boolean())
    const pd5 = poi.define(({ input }) => +input)
    expect(pd5.method).toStrictEqual('get')
    expectTypeOf(pd5.method).toEqualTypeOf<'get'>()
  })
})

/**
 * input, output, function, schema -> all kinds of validation
 */
describe('validation', () => {
  test('function validator input', () => {
    const pi = p('test').input((num: number) => {
      if (num > 2) {
        throw new Error('too big')
      }
      return num
    })
    const pd = pi.define(({ input }) => input)
    expect(pd.fn(1)).toStrictEqual(1)
    expectTypeOf(pd.fn(1)).toEqualTypeOf<number>()
    expect(() => pd.fn(3)).toThrow('too big')
    const pio = pi.output((bool: boolean) => {
      if (!bool) throw new Error('not true')
      return bool as boolean
    })
    const pd2 = pio.define(({ input }) => !!input)
    expect(pd2.fn(1)).toStrictEqual(true)
    expectTypeOf(pd2.fn(1)).toEqualTypeOf<boolean>()
    expect(() => pd2.fn(3)).toThrow('too big')
  })
  test('function validator output', () => {
    const po = p('test').output((num: number) => {
      if (num > 2) {
        throw new Error('too big')
      }
      return num
    })
    const pd = po.define(() => 1)
    expect(pd.fn()).toStrictEqual(1)
    expectTypeOf(pd.fn()).toEqualTypeOf<number>()
    const pdBad = po.define(() => 3)
    expect(() => pdBad.fn()).toThrow('too big')
    // with input attached (nested chain)
    const pi = po.input((num: string) => {
      if (isNaN(+num)) {
        throw new Error('not a number')
      }
      return num
    })
    const pd2 = pi.define(({ input }) => +input)
    expect(pd2.fn('1')).toStrictEqual(1)
    expectTypeOf(pd2.fn('1')).toEqualTypeOf<number>()
    expect(() => pd2.fn('3')).toThrow('too big')
  })
  test('schema validator input', () => {
    const pi = p('test').input(z.number())
    const pd = pi.define(({ input }) => input)
    expect(pd.fn(1)).toStrictEqual(1)
    expectTypeOf(pd.fn(1)).toEqualTypeOf<number>()
    // @ts-expect-error intentional bad call
    expect(() => pd.fn('3')).toThrow()
    const pio = pi.output(z.boolean())
    const pd2 = pio.define(({ input }) => !!input)
    expect(pd2.fn(1)).toStrictEqual(true)
    expectTypeOf(pd2.fn(1)).toEqualTypeOf<boolean>()
    // @ts-expect-error intentional bad call
    expect(() => pd2.fn('3')).toThrow()
  })
  test('schema validator output', () => {
    const po = p('test').output(z.number().max(2))
    const pd = po.define(() => 1)
    expect(pd.fn()).toStrictEqual(1)
    expectTypeOf(pd.fn()).toEqualTypeOf<number>()
    const pdBad = po.define(() => 3)
    expect(() => pdBad.fn()).toThrow()
    // with input attached (nested chain)
    const pi = po.input(z.string())
    const pd2 = pi.define(({ input }) => +input)
    expect(pd2.fn('1')).toStrictEqual(1)
    expectTypeOf(pd2.fn('1')).toEqualTypeOf<number>()
    expect(() => pd2.fn('3')).toThrow()
  })
  test('change parseKey access', () => {
    const pk = procedure({
      context,
      parseKey: '_parse',
      group: 'procedure',
      defaultMethod: 'call',
      defaultContext: context,
    })
    const schema = z.number().max(2)
    const changedSchema = { _parse: schema.parse }
    const pi = pk('test').input(changedSchema)
    const pd = pi.define(({ input }) => input)
    expect(pd.fn(1)).toStrictEqual(1)
    expectTypeOf(pd.fn(1)).toEqualTypeOf<number>()
    expect(() => pd.fn(3)).toThrow()
  })
})
