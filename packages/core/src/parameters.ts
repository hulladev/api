import type { CompiledPathParameters } from './compiler'
import { isRecord, setOwn } from './object'
import { decodeSchema, encodeSchema } from './validation'

function parameterGroup(
  declaration: CompiledPathParameters,
  value: Readonly<Record<string, unknown>>
): Record<string, unknown> {
  const group: Record<string, unknown> = {}
  for (const name of declaration.names) setOwn(group, name, value[name])
  return group
}

/** Encodes application path parameters and substitutes them into a compiled route path. */
export async function encodePathParameters(
  path: string,
  declarations: readonly CompiledPathParameters[],
  value: Readonly<Record<string, unknown>>
): Promise<string> {
  const encodedValues: Record<string, unknown> = {}

  for (const declaration of declarations) {
    const encoded = await encodeSchema(declaration.schema, parameterGroup(declaration, value), {
      location: 'params',
    })
    if (!isRecord(encoded)) throw new TypeError('Encoded route parameters must be an object')

    for (const name of declaration.names) {
      const parameter = encoded[name]
      if (typeof parameter !== 'string') throw new TypeError(`Route parameter "${name}" must encode to a string`)
      setOwn(encodedValues, name, parameter)
    }
  }

  return path
    .split('/')
    .map((segment) =>
      segment.startsWith(':')
        ? encodeURIComponent((encodedValues[segment.slice(1)] as string | undefined) ?? '')
        : segment
    )
    .join('/')
}

/** Decodes captured wire path parameters into their combined application representation. */
export async function decodePathParameters(
  declarations: readonly CompiledPathParameters[],
  value: Readonly<Record<string, string>>
): Promise<Readonly<Record<string, unknown>>> {
  const decodedValues: Record<string, unknown> = {}

  for (const declaration of declarations) {
    const decoded = await decodeSchema(declaration.schema, parameterGroup(declaration, value), {
      location: 'params',
    })
    if (!isRecord(decoded)) throw new TypeError('Decoded route parameters must be an object')
    for (const name of declaration.names) setOwn(decodedValues, name, decoded[name])
  }

  return Object.freeze(decodedValues)
}
