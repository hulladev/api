import { describe, expect, test } from 'vitest'
import { encodeKey, queryKey } from '../src/keys'

describe('keys', () => {
  test('encodeKey', () => {
    expect(encodeKey('users', 'byId')).toBe('users/byId')
  })

  test('queryKey', () => {
    expect(queryKey('users', 'byId', 2)).toStrictEqual(['users/byId', 2])
    expect(queryKey('users', 'all')).toStrictEqual(['users/all'])
    expect(queryKey('users', 'all', 1, 2, 3)).toStrictEqual(['users/all', 1, 2, 3])
  })
})
