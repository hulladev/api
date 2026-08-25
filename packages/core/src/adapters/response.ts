import type { CanonicalResponseEntry, CanonicalResponsePlan } from '../contract/plan'
import { textWireObject } from '../contract/request'
import { isRecord, setOwn } from '../object'
import { ServerRuntimeError } from '../server/errors'
import type { StreamFormat, StreamSource } from '../stream'
import { isSchemaStepAsync, mapSchemaStep, type SchemaStep } from '../validation'
import type { AdapterResponse, AdapterResponseBody } from './types'

type ResponseSerializer = (value: Readonly<Record<string, unknown>>) => SchemaStep<AdapterResponse>
export type RuntimeResponseSerializer = (value: unknown) => SchemaStep<AdapterResponse>

async function* encodedStream(
  source: StreamSource<unknown>,
  schema: {
    readonly decode: (value: unknown) => SchemaStep<unknown>
    readonly encode?: (value: unknown) => SchemaStep<unknown>
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
): (value: unknown) => SchemaStep<Readonly<Record<string, string>> | undefined> {
  const definition = plan.definition
  if (definition.headers === undefined) {
    return (value) => value as Readonly<Record<string, string>> | undefined
  }
  const schema = plan.headers!
  return (value) => {
    const wire = schema.encode === undefined ? mapSchemaStep(schema.decode(value), () => value) : schema.encode(value)
    return mapSchemaStep(wire, (wireValue) => {
      const encoded = textWireObject(wireValue, 'headers')
      const headers: Record<string, string> = {}
      for (const [key, field] of Object.entries(encoded)) {
        if (field !== undefined) setOwn(headers, key, field)
      }
      return headers
    })
  }
}

type SerializedResponseBody = {
  readonly kind: AdapterResponseBody['kind']
  readonly value: unknown
}

function compileResponseBody(plan: CanonicalResponsePlan): (value: unknown) => SchemaStep<SerializedResponseBody> {
  const definition = plan.definition
  const body = definition.body

  switch (body.kind) {
    case 'empty':
      return () => ({ kind: 'empty', value: undefined })
    case 'json': {
      const schema = plan.body!
      return (value) => {
        const wire =
          schema.encode === undefined ? mapSchemaStep(schema.decode(value), () => value) : schema.encode(value)
        return mapSchemaStep(wire, (wireValue) => {
          if (wireValue === undefined) throw new TypeError('JSON response body cannot encode to undefined')
          return { kind: 'json', value: wireValue }
        })
      }
    }
    case 'text': {
      const schema = plan.body!
      return (value) => {
        const wire =
          schema.encode === undefined ? mapSchemaStep(schema.decode(value), () => value) : schema.encode(value)
        return mapSchemaStep(wire, (wireValue) => {
          if (typeof wireValue !== 'string') throw new TypeError('Text response body must encode to a string')
          return { kind: 'text', value: wireValue }
        })
      }
    }
    case 'bytes': {
      const schema = plan.body!
      return (value) => {
        const wire =
          schema.encode === undefined ? mapSchemaStep(schema.decode(value), () => value) : schema.encode(value)
        return mapSchemaStep(wire, (wireValue) => {
          if (!(wireValue instanceof Uint8Array)) throw new TypeError('Byte response body must encode to Uint8Array')
          return { kind: 'bytes', value: wireValue }
        })
      }
    }
    case 'form-data': {
      const schema = plan.body!
      return (value) => {
        const wire =
          schema.encode === undefined ? mapSchemaStep(schema.decode(value), () => value) : schema.encode(value)
        return mapSchemaStep(wire, (wireValue) => {
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
    initialHeaders: Readonly<Record<string, string>> | undefined,
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

  return (value) => {
    const headers = serializeHeaders(value['headers'])
    const serializedBody = serializeBody(value['body'])
    return isSchemaStepAsync(headers) || isSchemaStepAsync(serializedBody)
      ? Promise.all([headers, serializedBody]).then(([resolvedHeaders, resolvedBody]) =>
          finalize(resolvedHeaders, resolvedBody)
        )
      : finalize(headers, serializedBody)
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
