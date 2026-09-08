import { expect, test, vi } from 'vitest'
import { z } from 'zod'
import { compilePathParameterDecoder, compilePathParameterEncoder } from '../src/contract/parameters'
import { codec } from '../src/validation'

test('isolates a single asynchronous parameter declaration and filters its output', async () => {
  const input = Object.freeze({ id: 'wire', extra: 'caller' })
  const decode = compilePathParameterDecoder([
    {
      path: '/:id',
      names: ['id'],
      schema: {
        '~standard': {
          version: 1,
          vendor: 'test',
          async validate(value: unknown) {
            expect(value).toEqual({ id: 'wire' })
            expect(value).not.toBe(input)
            return { value: { id: 42, extra: 'validator' } }
          },
        },
      },
    },
  ])
  await expect(decode(input)).resolves.toEqual({ id: 42 })
  expect(input).toEqual({ id: 'wire', extra: 'caller' })
})

test.each([false, true])(
  'decodes isolated groups with prototype-named fields, asynchronous=%s',
  async (asynchronous) => {
    const seen: unknown[] = []
    const schema = {
      '~standard': {
        version: 1 as const,
        vendor: 'test',
        validate(value: unknown) {
          seen.push(value)
          const result = { value: { ...(value as Record<string, unknown>), extra: 'discarded' } }
          return asynchronous ? Promise.resolve(result) : result
        },
      },
    }
    const decode = compilePathParameterDecoder([
      { path: '/:__proto__/:constructor', names: ['__proto__', 'constructor'], schema },
      { path: '/:id', names: ['id'], schema },
    ])
    const input = Object.freeze(JSON.parse('{"__proto__":"safe","constructor":"name","id":"雪","extra":"original"}'))
    const result = await decode(input)
    expect(seen).toEqual([JSON.parse('{"__proto__":"safe","constructor":"name"}'), { id: '雪' }])
    expect(result).toEqual(JSON.parse('{"__proto__":"safe","constructor":"name","id":"雪"}'))
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype)
    expect(Object.hasOwn(result, '__proto__')).toBe(true)
    expect(input.extra).toBe('original')
  }
)

test('renders ordinary parameters without changing values or interpreting prototype names', () => {
  const schema = z.object({ id: z.string() })
  const encode = compilePathParameterEncoder('/items/:id/:__proto__/:constructor', [
    { path: '/items/:id/:__proto__/:constructor', names: ['id', '__proto__', 'constructor'], schema },
  ])
  const input = Object.freeze(JSON.parse('{"id":"雪 / %","__proto__":"safe","constructor":"value"}'))
  expect(encode(input)).toBe('/items/%E9%9B%AA%20%2F%20%25/safe/value')
  for (const id of [undefined, null, 42, '.', '..']) {
    expect(() => encode({ ...input, id })).toThrow(/Route parameter/)
  }
})

test('keeps asynchronous codecs isolated to their nested declaration groups', async () => {
  const encodeParent = vi.fn<(value: { organization: number }) => Promise<{ organization: string }>>(
    async ({ organization }) => ({
      organization: String(organization),
    })
  )
  const schema = codec(z.object({ organization: z.string() }), z.strictObject({ organization: z.number() }), {
    decode: ({ organization }) => ({ organization: Number(organization) }),
    encode: encodeParent,
  })
  const encode = compilePathParameterEncoder('/organizations/:organization/items/:id', [
    { path: '/organizations/:organization', names: ['organization'], schema },
    { path: '/items/:id', names: ['id'], schema: z.object({ id: z.string() }) },
  ])
  const values = Object.freeze({ organization: 42, id: 'child/雪', extra: true })
  await expect(encode(values)).resolves.toBe('/organizations/42/items/child%2F%E9%9B%AA')
  expect(encodeParent).toHaveBeenCalledExactlyOnceWith({ organization: 42 })
  expect(values).toEqual({ organization: 42, id: 'child/雪', extra: true })
})
