import type { CompiledPathParameters } from './compiler'
import { type ExecutionStep, isPromiseLike, mapExecutionStep } from './execution'
import { isRecord, setOwn } from './object'
import { compileSchemaExecution } from './validation'

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

function substituteParameters(path: string, encodedValues: Readonly<Record<string, unknown>>): string {
  return path
    .split('/')
    .map((segment) =>
      segment.startsWith(':')
        ? encodeURIComponent((encodedValues[segment.slice(1)] as string | undefined) ?? '')
        : segment
    )
    .join('/')
}

/** Compiles application path parameter encoding for a route. */
export function compilePathParameterEncoder(
  path: string,
  declarations: readonly CompiledPathParameters[]
): PathParameterEncoder {
  const plans = declarations.map((declaration) => ({
    declaration,
    encode: compileSchemaExecution(declaration.schema, { location: 'params' }).encode,
  }))

  return (value) => {
    type EncodedGroup = {
      readonly declaration: CompiledPathParameters
      readonly encoded: Readonly<Record<string, unknown>>
    }
    const steps = plans.map(({ declaration, encode }) => {
      const group = parameterGroup(declaration, value)
      const encoded = encode === undefined ? group : encode(group)
      return mapExecutionStep(encoded, (resolved) => {
        if (!isRecord(resolved)) throw new TypeError('Encoded route parameters must be an object')
        return { declaration, encoded: resolved }
      })
    })
    const resolved = (steps.some(isPromiseLike) ? Promise.all(steps) : steps) as ExecutionStep<readonly EncodedGroup[]>

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
      return substituteParameters(path, encodedValues)
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
    type DecodedGroup = {
      readonly declaration: CompiledPathParameters
      readonly decoded: Readonly<Record<string, unknown>>
    }
    const steps = plans.map(({ declaration, decode }) => {
      return mapExecutionStep(decode(parameterGroup(declaration, value)), (decoded) => {
        if (!isRecord(decoded)) throw new TypeError('Decoded route parameters must be an object')
        return { declaration, decoded }
      })
    })
    const resolved = (steps.some(isPromiseLike) ? Promise.all(steps) : steps) as ExecutionStep<readonly DecodedGroup[]>

    return mapExecutionStep(resolved, (groups) => {
      const decodedValues: Record<string, unknown> = {}
      for (const { declaration, decoded } of groups) {
        for (const name of declaration.names) setOwn(decodedValues, name, decoded[name])
      }
      return decodedValues
    })
  }
}
