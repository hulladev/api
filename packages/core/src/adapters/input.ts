import type { CanonicalRequestBodyPlan, CanonicalRoutePlan } from '../contract/plan'
import type { QuerySource } from '../contract/query'
import { mimeEssence } from '../contract/request'
import { ServerRuntimeError } from '../server/errors'
import { isSchemaStepAsync, mapSchemaStep, type SchemaStep } from '../validation'
import type { AdapterRouteInput } from './types'

export type RuntimeInputDecoder = (
  parameters: Readonly<Record<string, string>>,
  input: AdapterRouteInput,
  query: QuerySource | undefined
) => SchemaStep<Record<string, unknown>>

const emptyHeaders = {}
const emptyQuery = {}

function wireHeaders(input: AdapterRouteInput): Readonly<Record<string, string>> {
  return input.headers ?? input.readHeaders?.() ?? emptyHeaders
}
function compileBodyDecoder(
  plan: CanonicalRequestBodyPlan,
  preserveRequest: boolean
): (input: AdapterRouteInput) => SchemaStep<unknown> {
  const declaration = plan.declaration
  const decode = plan.schema.decode
  const readError = (cause: unknown) =>
    new ServerRuntimeError('invalid-request-body', 400, 'Request body could not be decoded', {
      cause,
      location: 'body',
    })

  return (input) => {
    const provided = input.body
    const contentType = provided?.contentType ?? wireHeaders(input)['content-type'] ?? ''
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
      wire = input.readBody(declaration.representation, preserveRequest)
    } catch (cause) {
      throw readError(cause)
    }
    return wire.then(decode, (cause) => {
      throw readError(cause)
    })
  }
}

export function compileRouteInput(plan: CanonicalRoutePlan, preserveRequest: boolean): RuntimeInputDecoder {
  const decodeParams = plan.decodePath
  const decodeQuery = plan.decodeQuery
  const decodeHeaders = plan.headers?.decode
  const decodeBody = plan.body === undefined ? undefined : compileBodyDecoder(plan.body, preserveRequest)
  const fieldCount =
    Number(decodeParams !== undefined) +
    Number(decodeQuery !== undefined) +
    Number(decodeHeaders !== undefined) +
    Number(decodeBody !== undefined)

  if (fieldCount === 1) {
    if (decodeParams !== undefined) {
      return (parameters) => mapSchemaStep(decodeParams(parameters), (params) => ({ params }))
    }
    if (decodeQuery !== undefined) {
      return (_parameters, _request, query) =>
        mapSchemaStep(decodeQuery(query ?? emptyQuery), (queryValue) => ({ query: queryValue }))
    }
    if (decodeHeaders !== undefined) {
      return (_parameters, request) => mapSchemaStep(decodeHeaders(wireHeaders(request)), (headers) => ({ headers }))
    }
    return (_parameters, request) => mapSchemaStep(decodeBody!(request), (body) => ({ body }))
  }

  return (parameters, request, query) => {
    const values = [
      decodeParams?.(parameters),
      decodeQuery?.(query ?? emptyQuery),
      decodeHeaders?.(wireHeaders(request)),
      decodeBody?.(request),
    ] as const
    const resolved = values.some(isSchemaStepAsync) ? Promise.all(values) : values
    return mapSchemaStep(resolved, ([params, queryValue, headers, bodyValue]) => {
      const input: Record<string, unknown> = {}
      if (decodeParams !== undefined) input['params'] = params
      if (decodeQuery !== undefined) input['query'] = queryValue
      if (decodeHeaders !== undefined) input['headers'] = headers
      if (decodeBody !== undefined) input['body'] = bodyValue
      return input
    })
  }
}
