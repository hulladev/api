import type { CanonicalRequestBodyPlan } from '../contract/plan'
import type { QuerySource } from '../contract/query'
import { mimeEssence } from '../contract/request'
import type { ServerRoutePlan } from '../contract/server-plan'
import { mapExecutionStep, type ExecutionStep, mapExecutionSteps } from '../execution'
import { ServerRuntimeError } from '../server/errors'
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
function compileBodyDecoder(plan: CanonicalRequestBodyPlan): (input: AdapterRouteInput) => ExecutionStep<unknown> {
  const declaration = plan.declaration
  const decode = plan.schema.decode
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
    if (received !== plan.expectedContentType) {
      throw new ServerRuntimeError(
        'unsupported-media-type',
        415,
        `Expected request content type ${plan.expectedContentType}, received ${received || 'none'}`,
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

export function compileRouteInput(plan: ServerRoutePlan): RuntimeInputDecoder {
  const decodeParams = plan.decodePath
  const decodeQuery = plan.decodeQuery
  const decodeHeaders = plan.headers?.decode
  const decodeBody = plan.body === undefined ? undefined : compileBodyDecoder(plan.body)
  const fieldCount =
    Number(decodeParams !== undefined) +
    Number(decodeQuery !== undefined) +
    Number(decodeHeaders !== undefined) +
    Number(decodeBody !== undefined)

  if (fieldCount === 1) {
    if (decodeParams !== undefined) {
      return (parameters) => mapExecutionStep(decodeParams(parameters), (params) => ({ params }))
    }
    if (decodeQuery !== undefined) {
      return (_parameters, _request, query) =>
        mapExecutionStep(decodeQuery(query ?? emptyQuery), (queryValue) => ({ query: queryValue }))
    }
    if (decodeHeaders !== undefined) {
      return (_parameters, request) => mapExecutionStep(decodeHeaders(wireHeaders(request)), (headers) => ({ headers }))
    }
    return (_parameters, request) => mapExecutionStep(decodeBody!(request), (body) => ({ body }))
  }

  return (parameters, request, query) => {
    const resolved = mapExecutionSteps([0, 1, 2, 3], (field) => {
      switch (field) {
        case 0:
          return decodeParams?.(parameters)
        case 1:
          return decodeQuery?.(query ?? emptyQuery)
        case 2:
          return decodeHeaders?.(wireHeaders(request))
        default:
          return decodeBody?.(request)
      }
    })
    return mapExecutionStep(resolved, ([params, queryValue, headers, bodyValue]) => {
      const input: Record<string, unknown> = {}
      if (decodeParams !== undefined) input['params'] = params
      if (decodeQuery !== undefined) input['query'] = queryValue
      if (decodeHeaders !== undefined) input['headers'] = headers
      if (decodeBody !== undefined) input['body'] = bodyValue
      return input
    })
  }
}
