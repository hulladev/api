import type { Schema } from './types.public'
import { annotatedHTTPWire, type HTTPWireSchemaConverter, type HTTPWireType } from './wire'

type ZodLike = Schema & { _def?: any; safeParse?: unknown }

export function zodWireSchemaConverter(): HTTPWireSchemaConverter {
  return {
    supports(schema) {
      const value = schema as ZodLike
      return typeof value.safeParse === 'function' && typeof value._def === 'object'
    },
    convert(schema, direction) {
      try {
        return convertZod(schema as ZodLike, direction, new Set())
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        throw new Error(
          `Cannot derive an HTTP wire type from this Zod schema: ${reason} ` +
            `Annotate it explicitly, for example httpWire(schema, { kind: 'string' }).`
        )
      }
    },
  }
}

function convertZod(schema: ZodLike, direction: 'input' | 'output', seen: Set<object>): HTTPWireType {
  const annotation = annotatedHTTPWire(schema)
  if (annotation) return annotation
  if (seen.has(schema)) throw new Error('recursive schemas require an explicit httpWire annotation.')
  seen.add(schema)
  try {
    const def = schema._def ?? {}
    const kind = zodKind(def)
    if (def.coerce === true) throw new Error('Zod coercion schemas require an explicit wire annotation.')
    if (kind === 'string') return { kind: 'string' }
    if (kind === 'number' || kind === 'nan') return { kind: 'number' }
    if (kind === 'boolean') return { kind: 'boolean' }
    if (kind === 'bigint') return { kind: 'bigint', encoding: 'decimal' }
    if (kind === 'date') return { kind: 'date', encoding: 'iso' }
    if (kind === 'literal') return literalWire(def)
    if (kind === 'enum' || kind === 'nativeenum') return enumWire(def)
    if (kind === 'array') return { kind: 'array', items: convertZod(def.element ?? def.type, direction, seen) }
    if (kind === 'tuple') {
      if (def.rest) throw new Error('rest tuples require an explicit wire annotation.')
      return {
        kind: 'tuple',
        items: (def.items as ZodLike[]).map((item) => convertZod(item, direction, seen)),
      }
    }
    if (kind === 'object') return objectWire(def, direction, seen)
    if (kind === 'optional' || kind === 'default' || kind === 'catch') {
      return { kind: 'optional', value: convertZod(def.innerType ?? def.type, direction, seen) }
    }
    if (kind === 'nullable') return { kind: 'nullable', value: convertZod(def.innerType ?? def.type, direction, seen) }
    if (kind === 'union' || kind === 'discriminatedunion') return unionWire(def, direction, seen)
    if (kind === 'readonly' || kind === 'brand' || kind === 'branded') {
      return convertZod(def.innerType ?? def.type, direction, seen)
    }
    if (kind === 'effects') {
      if (def.effect?.type === 'refinement') return convertZod(def.schema, direction, seen)
      throw new Error('preprocessors and transforms are not deterministic wire schemas.')
    }
    if (kind === 'pipe' || kind === 'transform' || kind === 'codec') {
      throw new Error('coercions, pipes, codecs, and transforms require an explicit wire annotation.')
    }
    if (kind === 'any' || kind === 'unknown' || kind === 'json') return { kind: 'json' }
    if (kind === 'null') return { kind: 'literal', value: null }
    throw new Error(`unsupported Zod kind ${JSON.stringify(kind || 'unknown')}.`)
  } finally {
    seen.delete(schema)
  }
}

function zodKind(def: any): string {
  return String(def.typeName ?? def.type ?? '')
    .replace(/^Zod/, '')
    .toLowerCase()
}

function literalWire(def: any): HTTPWireType {
  const values = def.values ?? (Object.prototype.hasOwnProperty.call(def, 'value') ? [def.value] : undefined)
  if (!Array.isArray(values) || values.length !== 1) throw new Error('multi-value literals are ambiguous.')
  const value = values[0]
  if (value !== null && !['string', 'number', 'boolean'].includes(typeof value)) {
    throw new Error('only string, number, boolean, and null literals are supported.')
  }
  return { kind: 'literal', value }
}

function enumWire(def: any): HTTPWireType {
  const raw = def.entries ?? def.values
  const values = Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? Object.values(raw) : []
  const unique = [...new Set(values.filter((value) => typeof value === 'string' || typeof value === 'number'))]
  if (unique.length === 0) throw new Error('empty or non-scalar enums are unsupported.')
  if (unique.every((value) => typeof value === 'string' || typeof value === 'number')) {
    if (unique.some((value) => typeof value === 'string') && unique.some((value) => typeof value === 'number')) {
      throw new Error('mixed string/number enums are ambiguous over URLs.')
    }
    return { kind: 'enum', values: unique as (string | number)[] }
  }
  throw new Error('mixed string/number enums are ambiguous over URLs.')
}

function objectWire(def: any, direction: 'input' | 'output', seen: Set<object>): HTTPWireType {
  const shape = typeof def.shape === 'function' ? def.shape() : def.shape
  if (!shape || typeof shape !== 'object') throw new Error('object shape is unavailable.')
  const properties: Record<string, HTTPWireType> = {}
  for (const [key, child] of Object.entries(shape)) {
    const wire = convertZod(child as ZodLike, direction, seen)
    properties[key] = wire
  }
  const catchall = def.catchall as ZodLike | undefined
  const catchallKind = catchall?._def ? zodKind(catchall._def) : ''
  return {
    kind: 'object',
    properties,
    ...(catchall && catchallKind !== 'never'
      ? { additionalProperties: convertZod(catchall, direction, seen) }
      : { additionalProperties: false as const }),
  }
}

function unionWire(def: any, direction: 'input' | 'output', seen: Set<object>): HTTPWireType {
  const schemas: ZodLike[] = Array.isArray(def.options)
    ? def.options
    : def.options instanceof Map
      ? [...def.options.values()]
      : []
  if (schemas.length === 0) throw new Error('union options are unavailable.')
  const options = schemas.map((schema) => convertZod(schema, direction, seen))
  const signatures = options.map(wireSignature)
  const provable =
    options.every((option) => option.kind === 'literal') ||
    options.every((option) => option.kind === 'object' && wireSignature(option) !== 'object')
  if (!provable || new Set(signatures).size !== signatures.length) {
    throw new Error('the union has overlapping HTTP representations and cannot be decoded unambiguously.')
  }
  return { kind: 'union', options }
}

function wireSignature(wire: HTTPWireType): string {
  if (wire.kind === 'literal') return `literal:${String(wire.value)}`
  if (wire.kind === 'object') {
    const discriminators = Object.entries(wire.properties)
      .filter(([, property]) => property.kind === 'literal')
      .map(([key, property]) => `${key}:${JSON.stringify((property as { value: unknown }).value)}`)
    return discriminators.length > 0 ? `object:${discriminators.join('|')}` : 'object'
  }
  return wire.kind
}
