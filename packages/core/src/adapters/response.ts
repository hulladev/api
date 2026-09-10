import type { RouteResponses } from '../contract/response'
import { compileResponseSchema, type ResponseSchema } from '../contract/schema'
import { mapExecutionStep, type ExecutionStep } from '../execution'
import { normalizeResponseHeaders } from '../headers'
import type { ResponseHeaderValues } from '../headers'
import { isRecord } from '../object'
import { ServerRuntimeError } from '../server/errors'
import type { StreamFormat, StreamSource } from '../stream'
import type { AdapterResponse, AdapterResponseBody } from './types'

type ResponseSerializer = (value: Readonly<Record<string, unknown>>) => ExecutionStep<AdapterResponse>
export type RuntimeResponseSerializer = (value: unknown) => ExecutionStep<AdapterResponse>

async function* encodedStream(
  source: StreamSource<unknown>,
  schema: {
    readonly decode: (value: unknown) => ExecutionStep<unknown>
    readonly encode?: (value: unknown) => ExecutionStep<unknown>
  }
): AsyncIterable<unknown> {
  for await (const value of source) {
    yield (schema.encode ?? schema.decode)(value)
  }
}

function compileResponseHeaders(
  plan: ResponseSchema
): (value: unknown) => ExecutionStep<ResponseHeaderValues | undefined> {
  const definition = plan.definition
  if (definition.headers === undefined) {
    return (value) => (value === undefined ? undefined : normalizeResponseHeaders(value))
  }
  const schema = plan.headers!
  return (value) => mapExecutionStep((schema.encode ?? schema.decode)(value), normalizeResponseHeaders)
}

type SerializedResponseBody = {
  readonly kind: AdapterResponseBody['kind']
  readonly value: unknown
}

function compileResponseBody(plan: ResponseSchema): (value: unknown) => ExecutionStep<SerializedResponseBody> {
  const definition = plan.definition
  const body = definition.body

  switch (body.kind) {
    case 'empty':
      return () => ({ kind: 'empty', value: undefined })
    case 'json':
    case 'text':
    case 'bytes':
    case 'form-data': {
      const schema = plan.body!
      return (value) =>
        mapExecutionStep((schema.encode ?? schema.decode)(value), (wire) => {
          if (body.kind === 'json' && wire === undefined)
            throw new TypeError('JSON response body cannot encode to undefined')
          if (body.kind === 'text' && typeof wire !== 'string')
            throw new TypeError('Text response body must encode to a string')
          if (body.kind === 'bytes' && !(wire instanceof Uint8Array))
            throw new TypeError('Byte response body must encode to Uint8Array')
          if (body.kind === 'form-data' && !(wire instanceof FormData))
            throw new TypeError('Form data response body must encode to FormData')
          return { kind: body.kind, value: wire }
        })
    }
    case 'stream': {
      const streamSchema = 'schema' in body ? plan.body! : undefined
      const format = 'format' in body ? (body.format as StreamFormat<unknown>) : undefined
      return (value) => {
        const source = value as StreamSource<unknown>
        const candidate = source as {
          readonly [Symbol.asyncIterator]?: unknown
          readonly [Symbol.iterator]?: unknown
        }
        if (
          source === null ||
          (typeof source !== 'object' && typeof source !== 'function') ||
          (typeof candidate[Symbol.asyncIterator] !== 'function' && typeof candidate[Symbol.iterator] !== 'function')
        ) {
          throw new TypeError('Stream response body must be iterable')
        }
        const wire =
          streamSchema === undefined || format === undefined
            ? source
            : format.encode(encodedStream(source, streamSchema))
        return { kind: 'stream', value: wire }
      }
    }
    case 'raw':
      return () => {
        throw new TypeError('Raw response bodies are serialized directly')
      }
  }
}

function compileResponseSerializer(plan: ResponseSchema, status: number): ResponseSerializer {
  const definition = plan.definition
  const body = definition.body
  if (body.kind === 'raw') {
    return (value) => ({
      status,
      headers: {},
      body: { kind: 'raw' as const, value: value['body'] },
    })
  }

  const serializeHeaders = compileResponseHeaders(plan)
  const serializeBody = compileResponseBody(plan)
  const contentType = definition.contentType
  const finalize = (
    initialHeaders: ResponseHeaderValues | undefined,
    serializedBody: SerializedResponseBody
  ): AdapterResponse => {
    let headers = initialHeaders
    if (serializedBody.kind === 'form-data') {
      if (headers !== undefined && 'content-type' in headers) {
        const { ['content-type']: _contentType, ...remaining } = headers
        headers = remaining
      }
    } else if (contentType !== undefined) {
      if (headers === undefined) headers = { 'content-type': contentType }
      else headers = { ...headers, 'content-type': contentType }
    }
    return {
      status,
      headers: headers ?? {},
      body: serializedBody,
    }
  }

  return (value) =>
    mapExecutionStep(serializeHeaders(value['headers']), (headers) =>
      mapExecutionStep(serializeBody(value['body']), (body) => finalize(headers, body))
    )
}

export function compileResponseDispatcher(responses: RouteResponses): RuntimeResponseSerializer {
  const serializers = new Map<number, ResponseSerializer>()
  for (const [status, response] of Object.entries(responses)) {
    serializers.set(Number(status), compileResponseSerializer(compileResponseSchema(response), Number(status)))
  }
  return (value) => {
    const serialize =
      isRecord(value) && typeof value['status'] === 'number' ? serializers.get(value['status']) : undefined
    if (!isRecord(value) || serialize === undefined) {
      throw new ServerRuntimeError('invalid-server-response', 500, 'Undeclared response status')
    }
    return serialize(value)
  }
}
