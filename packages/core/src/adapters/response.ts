import type { CanonicalResponseEntry, CanonicalResponsePlan } from '../contract/plan'
import { mapExecutionStep, type ExecutionStep, mapExecutionSteps } from '../execution'
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
    if (schema.encode === undefined) {
      await schema.decode(value)
      yield value
    } else yield await schema.encode(value)
  }
}

function compileResponseHeaders(
  plan: CanonicalResponsePlan
): (value: unknown) => ExecutionStep<ResponseHeaderValues | undefined> {
  const definition = plan.definition
  if (definition.headers === undefined) {
    return (value) => (value === undefined ? undefined : normalizeResponseHeaders(value))
  }
  const schema = plan.headers!
  return (value) => {
    const wire =
      schema.encode === undefined ? mapExecutionStep(schema.decode(value), () => value) : schema.encode(value)
    return mapExecutionStep(wire, normalizeResponseHeaders)
  }
}

type SerializedResponseBody = {
  readonly kind: AdapterResponseBody['kind']
  readonly value: unknown
}

function compileResponseBody(plan: CanonicalResponsePlan): (value: unknown) => ExecutionStep<SerializedResponseBody> {
  const definition = plan.definition
  const body = definition.body

  switch (body.kind) {
    case 'empty':
      return () => ({ kind: 'empty', value: undefined })
    case 'json': {
      const schema = plan.body!
      return (value) => {
        const wire =
          schema.encode === undefined ? mapExecutionStep(schema.decode(value), () => value) : schema.encode(value)
        return mapExecutionStep(wire, (wireValue) => {
          if (wireValue === undefined) throw new TypeError('JSON response body cannot encode to undefined')
          return { kind: 'json', value: wireValue }
        })
      }
    }
    case 'text': {
      const schema = plan.body!
      return (value) => {
        const wire =
          schema.encode === undefined ? mapExecutionStep(schema.decode(value), () => value) : schema.encode(value)
        return mapExecutionStep(wire, (wireValue) => {
          if (typeof wireValue !== 'string') throw new TypeError('Text response body must encode to a string')
          return { kind: 'text', value: wireValue }
        })
      }
    }
    case 'bytes': {
      const schema = plan.body!
      return (value) => {
        const wire =
          schema.encode === undefined ? mapExecutionStep(schema.decode(value), () => value) : schema.encode(value)
        return mapExecutionStep(wire, (wireValue) => {
          if (!(wireValue instanceof Uint8Array)) throw new TypeError('Byte response body must encode to Uint8Array')
          return { kind: 'bytes', value: wireValue }
        })
      }
    }
    case 'form-data': {
      const schema = plan.body!
      return (value) => {
        const wire =
          schema.encode === undefined ? mapExecutionStep(schema.decode(value), () => value) : schema.encode(value)
        return mapExecutionStep(wire, (wireValue) => {
          if (!(wireValue instanceof FormData)) throw new TypeError('Form data response body must encode to FormData')
          return { kind: 'form-data', value: wireValue }
        })
      }
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

function compileResponseSerializer(plan: CanonicalResponsePlan, status: number): ResponseSerializer {
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

  // Without a header schema, header normalization is synchronous. Only the body
  // can remain pending, so there is no concurrent validation work to coordinate.
  if (plan.headers === undefined) {
    return (value) => {
      const headers = serializeHeaders(value['headers']) as ResponseHeaderValues | undefined
      return mapExecutionStep(serializeBody(value['body']), (body) => finalize(headers, body))
    }
  }

  return (value) => {
    const steps = mapExecutionSteps([0, 1], (field): ExecutionStep<unknown> =>
      field === 0 ? serializeHeaders(value['headers']) : serializeBody(value['body'])
    )
    return mapExecutionStep(steps, ([headers, body]) =>
      finalize(headers as ResponseHeaderValues | undefined, body as SerializedResponseBody)
    )
  }
}

export function compileResponseDispatcher(entries: readonly CanonicalResponseEntry[]): RuntimeResponseSerializer {
  if (entries.length === 1) {
    const [status, response] = entries[0]!
    const serialize = compileResponseSerializer(response, status)
    return (value) => {
      if (!isRecord(value) || value['status'] !== status) {
        throw new ServerRuntimeError('invalid-server-response', 500, 'Undeclared response status')
      }
      return serialize(value)
    }
  }

  const serializers = new Map<number, ResponseSerializer>()
  for (const [status, response] of entries) serializers.set(status, compileResponseSerializer(response, status))

  return (value) => {
    const serialize =
      isRecord(value) && typeof value['status'] === 'number' ? serializers.get(value['status']) : undefined
    if (!isRecord(value) || serialize === undefined) {
      throw new ServerRuntimeError('invalid-server-response', 500, 'Undeclared response status')
    }
    return serialize(value)
  }
}
