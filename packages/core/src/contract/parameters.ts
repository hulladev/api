import type { CompiledPathParameters } from '../compiler'
import { type ExecutionStep, mapExecutionSteps, mapExecutionStep } from '../execution'
import { isRecord, setOwn } from '../object'
import { compileSchemaExecution } from '../validation'

function parameterGroup(
  declaration: CompiledPathParameters,
  value: Readonly<Record<string, unknown>>
): Record<string, unknown> {
  const group: Record<string, unknown> = {}
  for (const name of declaration.names) setOwn(group, name, value[name])
  return group
}

export type PathParameterEncoder = (value: Readonly<Record<string, unknown>>) => ExecutionStep<string>
export type PathParameterDecoder = (
  value: Readonly<Record<string, string>>
) => ExecutionStep<Readonly<Record<string, unknown>>>

/** Compiles application path parameter encoding for a route. */
export function compilePathParameterEncoder(
  path: string,
  declarations: readonly CompiledPathParameters[]
): PathParameterEncoder {
  const segments = path.split('/').map((segment) => (segment.startsWith(':') ? { name: segment.slice(1) } : segment))
  const plans = declarations.map((declaration) => ({
    declaration,
    encode: compileSchemaExecution(declaration.schema, { location: 'params' }).encode,
  }))

  return (value) => {
    const resolved = mapExecutionSteps(plans, ({ declaration, encode }) => {
      const group = parameterGroup(declaration, value)
      const encoded = encode === undefined ? group : encode(group)
      return mapExecutionStep(encoded, (resolved) => {
        if (!isRecord(resolved)) throw new TypeError('Encoded route parameters must be an object')
        return { declaration, encoded: resolved }
      })
    })

    return mapExecutionStep(resolved, (groups) => {
      const encodedValues: Record<string, string> = {}
      for (const { declaration, encoded } of groups) {
        for (const name of declaration.names) {
          const parameter = encoded[name]
          if (parameter === undefined || parameter === null) {
            throw new TypeError(`Route parameter "${name}" must be defined`)
          }
          if (typeof parameter !== 'string') {
            throw new TypeError(`Route parameter "${name}" must encode to a string`)
          }
          setOwn(encodedValues, name, parameter)
        }
      }
      return segments
        .map((segment) => (typeof segment === 'string' ? segment : encodeURIComponent(encodedValues[segment.name]!)))
        .join('/')
    })
  }
}

/** Compiles captured wire path parameter decoding for a route. */
export function compilePathParameterDecoder(declarations: readonly CompiledPathParameters[]): PathParameterDecoder {
  const plans = declarations.map((declaration) => ({
    declaration,
    decode: compileSchemaExecution(declaration.schema, { location: 'params' }).decode,
  }))

  return (value) => {
    const resolved = mapExecutionSteps(plans, ({ declaration, decode }) => {
      return mapExecutionStep(decode(parameterGroup(declaration, value)), (decoded) => {
        if (!isRecord(decoded)) throw new TypeError('Decoded route parameters must be an object')
        return { declaration, decoded }
      })
    })

    return mapExecutionStep(resolved, (groups) => {
      const decodedValues: Record<string, unknown> = {}
      for (const { declaration, decoded } of groups) {
        for (const name of declaration.names) setOwn(decodedValues, name, decoded[name])
      }
      return decodedValues
    })
  }
}
