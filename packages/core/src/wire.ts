import type { HTTPMethod, Schema } from './types.public'

export type HTTPWireType =
  | { readonly kind: 'string' }
  | { readonly kind: 'number' }
  | { readonly kind: 'boolean' }
  | { readonly kind: 'enum'; readonly values: readonly (string | number)[] }
  | { readonly kind: 'bigint'; readonly encoding: 'decimal' }
  | { readonly kind: 'date'; readonly encoding: 'iso' }
  | { readonly kind: 'bytes'; readonly encoding: 'base64' }
  | { readonly kind: 'literal'; readonly value: string | number | boolean | null }
  | { readonly kind: 'array'; readonly items: HTTPWireType }
  | { readonly kind: 'tuple'; readonly items: readonly HTTPWireType[] }
  | {
      readonly kind: 'object'
      readonly properties: Readonly<Record<string, HTTPWireType>>
      readonly additionalProperties?: false | HTTPWireType
    }
  | { readonly kind: 'optional'; readonly value: HTTPWireType }
  | { readonly kind: 'nullable'; readonly value: HTTPWireType }
  | { readonly kind: 'union'; readonly options: readonly HTTPWireType[] }
  | { readonly kind: 'json' }

type HTTPWireDirection = 'input' | 'output'

type HTTPWireScalar<W extends HTTPWireType, Direction extends HTTPWireDirection> = W extends {
  readonly kind: 'string'
}
  ? string
  : W extends { readonly kind: 'number' }
    ? number
    : W extends { readonly kind: 'boolean' }
      ? boolean
      : W extends { readonly kind: 'enum'; readonly values: infer Values extends readonly (string | number)[] }
        ? Values[number]
        : W extends { readonly kind: 'bigint' }
          ? Direction extends 'input'
            ? bigint
            : string
          : W extends { readonly kind: 'date' }
            ? Direction extends 'input'
              ? Date
              : string
            : W extends { readonly kind: 'bytes' }
              ? Direction extends 'input'
                ? Uint8Array
                : string
              : W extends { readonly kind: 'literal'; readonly value: infer Value }
                ? Value
                : never

type HTTPWireObjectProperties<
  Properties extends Readonly<Record<string, HTTPWireType>>,
  Direction extends HTTPWireDirection,
> = {
  -readonly [Key in keyof Properties as Properties[Key] extends { readonly kind: 'optional' }
    ? never
    : Key]: HTTPWireValue<Properties[Key], Direction>
} & {
  -readonly [Key in keyof Properties as Properties[Key] extends { readonly kind: 'optional' }
    ? Key
    : never]?: Properties[Key] extends { readonly kind: 'optional'; readonly value: infer Value extends HTTPWireType }
    ? HTTPWireValue<Value, Direction>
    : never
}

type HTTPWireObject<
  Properties extends Readonly<Record<string, HTTPWireType>>,
  AdditionalProperties,
  Direction extends HTTPWireDirection,
> = HTTPWireObjectProperties<Properties, Direction> &
  (AdditionalProperties extends HTTPWireType
    ? Record<
        string,
        HTTPWireValue<AdditionalProperties, Direction> | HTTPWireValue<Properties[keyof Properties], Direction>
      >
    : unknown)

type HTTPWireValue<W extends HTTPWireType, Direction extends HTTPWireDirection> = W extends {
  readonly kind: 'string' | 'number' | 'boolean' | 'enum' | 'bigint' | 'date' | 'bytes' | 'literal'
}
  ? HTTPWireScalar<W, Direction>
  : W extends { readonly kind: 'array'; readonly items: infer Items extends HTTPWireType }
    ? HTTPWireValue<Items, Direction>[]
    : W extends { readonly kind: 'tuple'; readonly items: infer Items extends readonly HTTPWireType[] }
      ? { -readonly [Index in keyof Items]: HTTPWireValue<Items[Index], Direction> }
      : W extends {
            readonly kind: 'object'
            readonly properties: infer Properties extends Readonly<Record<string, HTTPWireType>>
            readonly additionalProperties?: infer AdditionalProperties
          }
        ? HTTPWireObject<Properties, AdditionalProperties, Direction>
        : W extends { readonly kind: 'optional'; readonly value: infer Value extends HTTPWireType }
          ? HTTPWireValue<Value, Direction> | undefined
          : W extends { readonly kind: 'nullable'; readonly value: infer Value extends HTTPWireType }
            ? HTTPWireValue<Value, Direction> | null
            : W extends { readonly kind: 'union'; readonly options: infer Options extends readonly HTTPWireType[] }
              ? HTTPWireValue<Options[number], Direction>
              : W extends { readonly kind: 'json' }
                ? unknown
                : never

/** The value accepted by a generated client for an HTTP wire descriptor. */
export type HTTPWireInput<W extends HTTPWireType> = HTTPWireValue<W, 'input'>

/** The JSON value returned by a generated client for an HTTP wire descriptor. */
export type HTTPWireOutput<W extends HTTPWireType> = HTTPWireValue<W, 'output'>

export type HTTPInputContract =
  | { readonly kind: 'value'; readonly wire: HTTPWireType }
  | { readonly kind: 'tuple'; readonly items: readonly HTTPWireType[] }

export type HTTPRouteContract = {
  readonly router: string
  readonly procedure: string
  readonly method: HTTPMethod
  /** Full route path below `basePath`, including the router segment. */
  readonly path: string
  readonly input?: HTTPInputContract
  readonly output?: HTTPWireType
}

export type HTTPContract = {
  readonly version: 1
  readonly source: string
  readonly basePath: string
  readonly routes: Readonly<Record<string, Readonly<Record<string, HTTPRouteContract>>>>
}

export type HTTPWireSchemaConverter = {
  supports(schema: Schema): boolean
  convert(schema: Schema, direction: 'input' | 'output'): HTTPWireType
}

const annotations = new WeakMap<object, HTTPWireType>()

/** Associates an opaque validation schema with its deterministic HTTP representation. */
export function httpWire<const S extends Schema>(schema: S, wire: HTTPWireType): S {
  annotations.set(schema, wire)
  return schema
}

export function annotatedHTTPWire(schema: Schema): HTTPWireType | undefined {
  return annotations.get(schema)
}

export function schemaHTTPWire(
  schema: Schema,
  converters: readonly HTTPWireSchemaConverter[],
  direction: 'input' | 'output'
): HTTPWireType {
  const annotation = annotatedHTTPWire(schema)
  if (annotation) return annotation
  const converter = converters.find((candidate) => candidate.supports(schema))
  if (!converter) {
    throw new Error(
      `No HTTP wire converter supports this schema. Register schemaConverters or annotate it with httpWire(schema, { kind: 'json' }).`
    )
  }
  return converter.convert(schema, direction)
}

export function objectHTTPWire(wire: HTTPWireType | undefined): Extract<HTTPWireType, { kind: 'object' }> | undefined {
  let current = wire
  while (current?.kind === 'optional' || current?.kind === 'nullable') current = current.value
  return current?.kind === 'object' ? current : undefined
}
