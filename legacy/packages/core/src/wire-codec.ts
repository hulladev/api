import { base64ToBytes, bytesToBase64, decodeHTTPValue, encodeHTTPValue } from './codec'
import type { HTTPWireType } from './wire'

const numberPattern = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/
const isoDatePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/
const base64Pattern = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/

export function encodeHTTPBodyValue(wire: HTTPWireType, value: unknown): unknown {
  return transformHTTPBodyValue(wire, value, 'encode')
}

export function decodeHTTPBodyValue(wire: HTTPWireType, value: unknown): unknown {
  return transformHTTPBodyValue(wire, value, 'decode')
}

function transformHTTPBodyValue(wire: HTTPWireType, value: unknown, direction: 'encode' | 'decode'): unknown {
  const transform = (child: HTTPWireType, item: unknown) => transformHTTPBodyValue(child, item, direction)
  if (wire.kind === 'optional') return value === undefined ? undefined : transform(wire.value, value)
  if (wire.kind === 'nullable') return value === null ? null : transform(wire.value, value)
  if (wire.kind === 'union') {
    return direction === 'encode'
      ? transform(selectUnionWire(wire.options, value), value)
      : decodeUnion(wire.options, value, transform)
  }
  if (wire.kind === 'json') return direction === 'encode' ? decodeHTTPValue(encodeHTTPValue(value)) : value
  if (wire.kind === 'literal') {
    if (!Object.is(value, wire.value)) throw new TypeError(`Expected literal ${JSON.stringify(wire.value)}.`)
    return value
  }
  if (wire.kind === 'string') {
    if (typeof value !== 'string') throw new TypeError('Expected a string.')
    return value
  }
  if (wire.kind === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new TypeError('Expected a finite number.')
    }
    return value
  }
  if (wire.kind === 'boolean') {
    if (typeof value !== 'boolean') throw new TypeError('Expected a boolean.')
    return value
  }
  if (wire.kind === 'enum') {
    if (!wire.values.some((candidate) => Object.is(candidate, value))) throw new TypeError('Expected an enum value.')
    return value
  }
  if (wire.kind === 'bigint') {
    if (direction === 'encode') {
      if (typeof value !== 'bigint') throw new TypeError('Expected a bigint.')
      return value.toString()
    }
    if (typeof value !== 'string' || !/^-?\d+$/.test(value)) throw new TypeError('Expected a decimal bigint string.')
    return BigInt(value)
  }
  if (wire.kind === 'date') {
    if (direction === 'encode') {
      if (!(value instanceof Date) || Number.isNaN(value.getTime())) throw new TypeError('Expected a valid Date.')
      return value.toISOString()
    }
    if (typeof value !== 'string' || !isoDatePattern.test(value)) throw new TypeError('Expected an ISO date string.')
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) throw new TypeError('Expected an ISO date string.')
    return date
  }
  if (wire.kind === 'bytes') {
    if (direction === 'encode') {
      if (!(value instanceof Uint8Array)) throw new TypeError('Expected a Uint8Array.')
      return bytesToBase64(value)
    }
    if (typeof value !== 'string' || !isBase64(value)) throw new TypeError('Expected a base64 string.')
    return base64ToBytes(value)
  }
  if (wire.kind === 'array') {
    if (!Array.isArray(value)) throw new TypeError('Expected an array.')
    return value.map((item) => transform(wire.items, item))
  }
  if (wire.kind === 'tuple') {
    if (!Array.isArray(value) || value.length > wire.items.length) throw new TypeError('Expected a tuple.')
    return value.map((item, index) => transform(wire.items[index]!, item))
  }
  if (!isPlainObject(value)) throw new TypeError('Expected an object.')
  const result: Record<string, unknown> = {}
  for (const [key, property] of Object.entries(wire.properties)) {
    if (!(key in value) || value[key] === undefined) {
      continue
    }
    result[key] = transform(property, value[key])
  }
  for (const [key, item] of Object.entries(value)) {
    if (key in wire.properties) continue
    if (wire.additionalProperties) result[key] = transform(wire.additionalProperties, item)
    else throw new TypeError(`Unexpected object property "${key}".`)
  }
  return result
}

export function encodeHTTPURLValue(wire: HTTPWireType, value: unknown): string {
  if (wire.kind === 'optional') {
    if (value === undefined) throw new TypeError('Cannot encode an absent optional URL value.')
    return encodeHTTPURLValue(wire.value, value)
  }
  if (wire.kind === 'nullable') return value === null ? 'null' : encodeHTTPURLValue(wire.value, value)
  if (wire.kind === 'union') return encodeHTTPURLValue(selectUnionWire(wire.options, value), value)
  if (wire.kind === 'string') {
    encodeHTTPBodyValue(wire, value)
    return value as string
  }
  if (wire.kind === 'number' || wire.kind === 'boolean') {
    encodeHTTPBodyValue(wire, value)
    return String(value)
  }
  if (wire.kind === 'enum') {
    encodeHTTPBodyValue(wire, value)
    return String(value)
  }
  if (wire.kind === 'bigint') return String(encodeHTTPBodyValue(wire, value))
  if (wire.kind === 'date' || wire.kind === 'bytes') return encodeHTTPBodyValue(wire, value) as string
  if (wire.kind === 'literal') {
    encodeHTTPBodyValue(wire, value)
    return value === null ? 'null' : String(value)
  }
  return encodeHTTPValue(encodeHTTPBodyValue(wire, value))
}

export function decodeHTTPURLValue(wire: HTTPWireType, value: string | readonly string[]): unknown {
  if (wire.kind === 'optional') return decodeHTTPURLValue(wire.value, value)
  if (wire.kind === 'nullable') {
    if (typeof value === 'string' && value === 'null') return null
    return decodeHTTPURLValue(wire.value, value)
  }
  if (wire.kind === 'union') return decodeUnion(wire.options, value, decodeHTTPURLValue)
  if (wire.kind === 'array') {
    const values = typeof value === 'string' ? [value] : value
    if (values.length === 1 && (values[0]!.startsWith('[') || values[0]!.startsWith('{'))) {
      return decodeHTTPBodyValue(wire, decodeHTTPValue(values[0]!))
    }
    return values.map((item) => decodeHTTPURLValue(wire.items, item))
  }
  if (wire.kind === 'object' || wire.kind === 'tuple' || wire.kind === 'json') {
    if (typeof value !== 'string') throw new TypeError('Expected one JSON-encoded URL value.')
    return decodeHTTPBodyValue(wire, decodeHTTPValue(value))
  }
  if (typeof value !== 'string') throw new TypeError('Expected one URL value.')
  if (wire.kind === 'string') return decodeHTTPBodyValue(wire, value)
  if (wire.kind === 'number') {
    if (!numberPattern.test(value)) throw new TypeError('Expected a number.')
    return decodeHTTPBodyValue(wire, Number(value))
  }
  if (wire.kind === 'boolean') {
    if (value !== 'true' && value !== 'false') throw new TypeError('Expected "true" or "false".')
    return value === 'true'
  }
  if (wire.kind === 'enum') {
    const stringMatch = wire.values.find((candidate) => typeof candidate === 'string' && candidate === value)
    const numeric = numberPattern.test(value) ? Number(value) : undefined
    const numberMatch = wire.values.find((candidate) => typeof candidate === 'number' && candidate === numeric)
    if (stringMatch !== undefined && numberMatch !== undefined) throw new TypeError('Ambiguous enum URL value.')
    return decodeHTTPBodyValue(wire, stringMatch ?? numberMatch)
  }
  if (wire.kind === 'bigint' || wire.kind === 'date' || wire.kind === 'bytes') {
    return decodeHTTPBodyValue(wire, value)
  }
  if (wire.value === null) {
    if (value !== 'null') throw new TypeError('Expected "null".')
    return null
  }
  if (typeof wire.value === 'boolean' && value !== 'true' && value !== 'false') {
    throw new TypeError('Expected a boolean literal.')
  }
  const literal =
    typeof wire.value === 'number' ? Number(value) : typeof wire.value === 'boolean' ? value === 'true' : value
  return decodeHTTPBodyValue(wire, literal)
}

function decodeUnion<Value>(
  options: readonly HTTPWireType[],
  value: Value,
  decode: (wire: HTTPWireType, value: Value) => unknown
): unknown {
  let firstError: unknown
  for (const option of options) {
    try {
      return decode(option, value)
    } catch (error) {
      if (firstError === undefined) firstError = error
    }
  }
  throw firstError ?? new TypeError('No HTTP union option accepted the value.')
}

function selectUnionWire(options: readonly HTTPWireType[], value: unknown): HTTPWireType {
  const literal = options.find((option) => option.kind === 'literal' && Object.is(option.value, value))
  if (literal) return literal
  const matching = options.filter((option) => runtimeMatches(option, value))
  if (matching.length !== 1) throw new TypeError('HTTP union value is ambiguous.')
  return matching[0]!
}

function runtimeMatches(wire: HTTPWireType, value: unknown): boolean {
  if (wire.kind === 'optional') return value === undefined || runtimeMatches(wire.value, value)
  if (wire.kind === 'nullable') return value === null || runtimeMatches(wire.value, value)
  if (wire.kind === 'union') return wire.options.some((option) => runtimeMatches(option, value))
  if (wire.kind === 'json') return true
  if (wire.kind === 'literal') return Object.is(wire.value, value)
  if (wire.kind === 'string') return typeof value === 'string'
  if (wire.kind === 'number') return typeof value === 'number'
  if (wire.kind === 'boolean') return typeof value === 'boolean'
  if (wire.kind === 'enum') return wire.values.some((candidate) => Object.is(candidate, value))
  if (wire.kind === 'bigint') return typeof value === 'bigint'
  if (wire.kind === 'date') return value instanceof Date
  if (wire.kind === 'bytes') return value instanceof Uint8Array
  if (wire.kind === 'array' || wire.kind === 'tuple') return Array.isArray(value)
  return isPlainObject(value)
}

function isBase64(value: string): boolean {
  return value.length % 4 === 0 && base64Pattern.test(value)
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value) as unknown
  return prototype === Object.prototype || prototype === null
}
