import type { CompiledContractRoute } from '../compiler'
import { compilePathParameterDecoder } from '../contract/parameters'
import { compileQueryDecoder } from '../contract/query'
import type { QuerySource } from '../contract/query'
import type { AnyRequestBody } from '../contract/request'
import { mimeEssence } from '../contract/request'
import { compileExecutionFields, type ExecutionField, type ExecutionStep } from '../execution'
import { ServerRuntimeError } from '../server/errors'
import { compileSchemaExecution } from '../validation'
import type { AdapterRouteInput } from './types'

export type RuntimeInputDecoder = (
  parameters: Readonly<Record<string, string>>,
  input: AdapterRouteInput,
  query: QuerySource | undefined
) => ExecutionStep<Record<string, unknown>>

const emptyHeaders = {}
const emptyQuery = {}

function wireHeaders(input: AdapterRouteInput): Readonly<Record<string, string>> {
  return input.headers ?? input.readHeaders?.() ?? emptyHeaders
}
function wireHeader(input: AdapterRouteInput, name: string): string | undefined {
  if (input.headers !== undefined) return input.headers[name]
  if (input.readHeader !== undefined) return input.readHeader(name)
  return input.readHeaders?.()[name]
}
function compileBodyDecoder(declaration: AnyRequestBody): (input: AdapterRouteInput) => ExecutionStep<unknown> {
  const decode = compileSchemaExecution(declaration.schema, { location: 'body' }).decode
  const expectedContentType = mimeEssence(declaration.contentType)
  const readError = (cause: unknown) =>
    cause instanceof ServerRuntimeError
      ? cause
      : new ServerRuntimeError('invalid-request-body', 400, 'Request body could not be decoded', {
          cause,
          location: 'body',
        })

  return (input) => {
    const provided = input.body
    const contentType = provided?.contentType ?? wireHeader(input, 'content-type') ?? ''
    const received = mimeEssence(contentType)
    if (received !== expectedContentType) {
      throw new ServerRuntimeError(
        'unsupported-media-type',
        415,
        `Expected request content type ${expectedContentType}, received ${received || 'none'}`,
        { location: 'body' }
      )
    }

    if (provided !== undefined) return decode(provided.value)
    if (input.readBody === undefined) throw new TypeError('No request body reader')

    let wire: Promise<unknown>
    try {
      wire = input.readBody(declaration.representation, input.preserveRequestBody ?? false)
    } catch (cause) {
      throw readError(cause)
    }
    return wire.then(decode, (cause) => {
      throw readError(cause)
    })
  }
}

export function compileRouteInput(compiled: CompiledContractRoute): RuntimeInputDecoder {
  const route = compiled.route
  const decodeParams =
    compiled.pathParameters.length === 0 ? undefined : compilePathParameterDecoder(compiled.pathParameters)
  const decodeQuery = route.query === undefined ? undefined : compileQueryDecoder(route.query)
  const decodeHeaders =
    route.headers === undefined ? undefined : compileSchemaExecution(route.headers, { location: 'headers' }).decode
  const decodeBody = route.body === undefined ? undefined : compileBodyDecoder(route.body)

  const fields: ExecutionField<Parameters<RuntimeInputDecoder>>[] = []
  if (decodeParams !== undefined) fields.push(['params', (parameters) => decodeParams(parameters)])
  if (decodeQuery !== undefined)
    fields.push(['query', (_parameters, _request, query) => decodeQuery(query ?? emptyQuery)])
  if (decodeHeaders !== undefined)
    fields.push(['headers', (_parameters, request) => decodeHeaders(wireHeaders(request))])
  if (decodeBody !== undefined) fields.push(['body', (_parameters, request) => decodeBody(request)])
  return compileExecutionFields(fields)
}
