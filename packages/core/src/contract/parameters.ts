import type { CompiledPathParameters } from '../compiler'
import { mapExecutionStep, mapExecutionSteps, type ExecutionStep } from '../execution'
import { isRecord, setOwn } from '../object'
import { compileSchemaExecution } from '../validation'

function group(declaration: CompiledPathParameters, value: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const fields: Record<string, unknown> = {}
  for (const name of declaration.names) setOwn(fields, name, value[name])
  return fields
}

export type PathParameterEncoder = (value: Readonly<Record<string, unknown>>) => ExecutionStep<string>
export type PathParameterDecoder = (
  value: Readonly<Record<string, string>>
) => ExecutionStep<Readonly<Record<string, unknown>>>

/** Produces captured wire parameters once for both direct dispatch and HTTP path rendering. */
export function compilePathParameterValues(
  declarations: readonly CompiledPathParameters[]
): (value: Readonly<Record<string, unknown>>) => ExecutionStep<Readonly<Record<string, string>>> {
  const fields = declarations.map((declaration) => ({
    declaration,
    encode: compileSchemaExecution(declaration.schema, { location: 'params' }).encode,
  }))
  return (value) =>
    mapExecutionStep(
      mapExecutionSteps(fields, ({ declaration, encode }) =>
        encode === undefined ? value : encode(group(declaration, value))
      ),
      (groups) => {
        const parameters: Record<string, string> = {}
        for (let index = 0; index < fields.length; index++) {
          const values = groups[index]
          if (!isRecord(values)) throw new TypeError('Encoded route parameters must be an object')
          for (const name of fields[index]!.declaration.names) {
            const parameter = values[name]
            if (typeof parameter !== 'string') throw new TypeError(`Route parameter "${name}" must encode to a string`)
            if (parameter === '.' || parameter === '..')
              throw new TypeError(`Route parameter "${name}" cannot be a dot segment`)
            setOwn(parameters, name, parameter)
          }
        }
        return Object.freeze(parameters)
      }
    )
}

export function compilePathRenderer(path: string): (parameters: Readonly<Record<string, string>>) => string {
  const segments = path.split('/').map((segment) => (segment.startsWith(':') ? { name: segment.slice(1) } : segment))
  return (parameters) => {
    let rendered = ''
    for (let index = 0; index < segments.length; index++) {
      const segment = segments[index]!
      if (index > 0) rendered += '/'
      rendered += typeof segment === 'string' ? segment : encodeURIComponent(parameters[segment.name]!)
    }
    return rendered
  }
}

export function compilePathParameterEncoder(
  path: string,
  declarations: readonly CompiledPathParameters[]
): PathParameterEncoder {
  const encode = compilePathParameterValues(declarations)
  const render = compilePathRenderer(path)
  return (value) => mapExecutionStep(encode(value), render)
}

export function compilePathParameterDecoder(declarations: readonly CompiledPathParameters[]): PathParameterDecoder {
  const fields = declarations.map((declaration) => ({
    declaration,
    decode: compileSchemaExecution(declaration.schema, { location: 'params' }).decode,
  }))
  return (value) =>
    mapExecutionStep(
      mapExecutionSteps(fields, ({ declaration, decode }) => decode(group(declaration, value))),
      (groups) => {
        const parameters: Record<string, unknown> = {}
        for (let index = 0; index < fields.length; index++) {
          const values = groups[index]
          if (!isRecord(values)) throw new TypeError('Decoded route parameters must be an object')
          for (const name of fields[index]!.declaration.names) setOwn(parameters, name, values[name])
        }
        return parameters
      }
    )
}
