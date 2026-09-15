import type { IncomingHttpHeaders } from 'node:http'
import { expect, test } from 'vitest'
import { nodeRequestHeader, nodeRequestHeaders } from '../src'

test('single and full Node header readers preserve own literal names and repeated values', () => {
  const source: IncomingHttpHeaders = Object.freeze(
    Object.create(
      { inherited: 'excluded' },
      Object.getOwnPropertyDescriptors({
        ...JSON.parse('{"__proto__":"literal","constructor":"name","content-type":"application/json"}'),
        'x-repeat': ['one', 'two'],
        'x-empty': '',
        absent: undefined,
        ':method': 'POST',
      })
    )
  )
  const record = nodeRequestHeaders(source)
  for (const name of ['__proto__', 'constructor', 'content-type', 'x-repeat', 'x-empty']) {
    expect(Object.hasOwn(record, name)).toBe(true)
    expect(nodeRequestHeader(source, name)).toBe(record[name])
  }
  expect(record['__proto__']).toBe('literal')
  expect(record['x-repeat']).toBe('one, two')
  expect(Object.getPrototypeOf(record)).toBe(Object.prototype)
  expect(nodeRequestHeader(source, 'inherited')).toBeUndefined()
  expect(nodeRequestHeader(source, ':method')).toBeUndefined()
  expect(nodeRequestHeader(source, 'absent')).toBeUndefined()
  expect(Object.hasOwn(record, ':method')).toBe(false)
  expect(Object.hasOwn(record, 'absent')).toBe(false)
  expect(Object.hasOwn(record, 'inherited')).toBe(false)
  expect(source['x-repeat']).toEqual(['one', 'two'])
})
