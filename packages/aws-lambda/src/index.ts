import type { Contract } from '@hulla/api'
import {
  createAdapterHandler,
  type AdapterErrorInput,
  type AdapterResponse,
  type AdapterResponseBody,
} from '@hulla/api/adapters'
import {
  assertAdapterContext,
  createServerAdapter,
  serverContextAdapterId,
  type Awaitable,
  type ServerAdapter,
  type ServerContextInput,
  type ServerExecutableFor,
} from '@hulla/api/server'
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2, Context as LambdaContext } from 'aws-lambda'

export type AWSLambdaResponse = Omit<APIGatewayProxyStructuredResultV2, 'statusCode'> & {
  readonly statusCode: number
}

export type AWSLambdaHandler<Event extends APIGatewayProxyEventV2 = APIGatewayProxyEventV2> = (
  event: Event,
  context: LambdaContext
) => Promise<AWSLambdaResponse>

type AWSLambdaAdapterContext<Event extends APIGatewayProxyEventV2> = {
  readonly event: Event
  readonly lambdaContext: LambdaContext
}

export type AWSLambdaContextInput<
  ContractType extends Contract = Contract,
  Event extends APIGatewayProxyEventV2 = APIGatewayProxyEventV2,
> = ServerContextInput<ContractType> & AWSLambdaAdapterContext<Event>

export type AWSLambdaServerErrorInput<Event extends APIGatewayProxyEventV2 = APIGatewayProxyEventV2> = Omit<
  AdapterErrorInput,
  'defaultResponse' | 'hostContext' | 'request'
> &
  AWSLambdaAdapterContext<Event> & {
    readonly defaultResponse: AWSLambdaResponse
  }

export type AWSLambdaServerOptions<Event extends APIGatewayProxyEventV2 = APIGatewayProxyEventV2> = {
  /** Resolves the contract pathname. Defaults to the event's `rawPath`. */
  readonly pathname?: (event: Event) => string
  readonly onError?: (input: AWSLambdaServerErrorInput<Event>) => Awaitable<AWSLambdaResponse | undefined | void>
}

export type AWSLambdaAdapter<Event extends APIGatewayProxyEventV2 = APIGatewayProxyEventV2> = ServerAdapter<
  'aws-lambda',
  AWSLambdaAdapterContext<Event>
> & {
  readonly mount: <const ContractType extends Contract, const Context extends object>(
    implementation: ServerExecutableFor<ContractType, Context, 'aws-lambda', AWSLambdaAdapterContext<Event>>,
    options?: AWSLambdaServerOptions<Event>
  ) => AWSLambdaHandler<Event>
}

function eventHeaders(event: APIGatewayProxyEventV2): Readonly<Record<string, string>> {
  const headers: Record<string, string> = {}
  for (const [name, value] of Object.entries(event.headers)) {
    if (value !== undefined) headers[name] = value
  }
  if (event.cookies !== undefined && event.cookies.length > 0 && headers['cookie'] === undefined) {
    headers['cookie'] = event.cookies.join('; ')
  }
  return headers
}

function eventBodyBytes(event: APIGatewayProxyEventV2): Uint8Array {
  const body = event.body ?? ''
  return event.isBase64Encoded ? Buffer.from(body, 'base64') : new TextEncoder().encode(body)
}

async function readEventBody(
  event: APIGatewayProxyEventV2,
  headers: Readonly<Record<string, string>>,
  representation: string
): Promise<unknown> {
  switch (representation) {
    case 'json':
      return JSON.parse(event.body ?? '') as unknown
    case 'text':
      return event.isBase64Encoded ? new TextDecoder().decode(eventBodyBytes(event)) : (event.body ?? '')
    case 'bytes':
      return eventBodyBytes(event)
    case 'form-data':
      return new Response(eventBodyBytes(event) as unknown as BodyInit, { headers }).formData()
    default:
      throw new TypeError(`Unsupported AWS Lambda request body representation ${representation}`)
  }
}

async function collectBytes(source: unknown): Promise<Uint8Array> {
  const candidate = source as AsyncIterable<unknown> & Iterable<unknown>
  const iterator =
    typeof candidate[Symbol.asyncIterator] === 'function'
      ? candidate[Symbol.asyncIterator]()
      : candidate[Symbol.iterator]()
  const chunks: Uint8Array[] = []
  let length = 0
  for (;;) {
    const result = await iterator.next()
    if (result.done) break
    if (!(result.value instanceof Uint8Array)) throw new TypeError('Stream chunk must be Uint8Array')
    chunks.push(result.value)
    length += result.value.byteLength
  }
  const body = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return body
}

function splitResponseHeaders(source: AdapterResponse['headers']): {
  readonly cookies?: readonly string[]
  readonly headers: Readonly<Record<string, string>>
} {
  const headers: Record<string, string> = {}
  let cookies: readonly string[] | undefined
  for (const [name, value] of Object.entries(source)) {
    if (name.toLowerCase() === 'set-cookie') cookies = typeof value === 'string' ? [value] : value
    else headers[name] = typeof value === 'string' ? value : value.join(', ')
  }
  return cookies === undefined ? { headers } : { cookies, headers }
}

function rawLambdaResponse(body: AdapterResponseBody, status: number): AWSLambdaResponse | undefined {
  if (body.kind !== 'raw') return undefined
  const value = body.value as Partial<AWSLambdaResponse>
  if (typeof value !== 'object' || value === null || value.statusCode !== status) {
    throw new TypeError('Raw AWS Lambda response status must match its declared contract status')
  }
  return value as AWSLambdaResponse
}

async function lambdaResponse(response: AdapterResponse): Promise<AWSLambdaResponse> {
  const raw = rawLambdaResponse(response.body, response.status)
  if (raw !== undefined) return raw

  let headerSource = response.headers
  let body: string | undefined
  let isBase64Encoded = false
  switch (response.body.kind) {
    case 'empty':
      break
    case 'json':
      body = JSON.stringify(response.body.value)
      break
    case 'text':
      if (typeof response.body.value !== 'string') {
        throw new TypeError('Text adapter response body must be a string')
      }
      body = response.body.value
      break
    case 'bytes':
      if (!(response.body.value instanceof Uint8Array)) {
        throw new TypeError('Byte adapter response body must be Uint8Array')
      }
      body = Buffer.from(response.body.value).toString('base64')
      isBase64Encoded = true
      break
    case 'form-data': {
      if (!(response.body.value instanceof FormData)) {
        throw new TypeError('Form data response body must be FormData')
      }
      const serialized = new Response(response.body.value)
      headerSource = { ...headerSource, 'content-type': serialized.headers.get('content-type') ?? '' }
      body = Buffer.from(await serialized.arrayBuffer()).toString('base64')
      isBase64Encoded = true
      break
    }
    case 'stream':
      body = Buffer.from(await collectBytes(response.body.value)).toString('base64')
      isBase64Encoded = true
      break
    case 'raw':
      throw new TypeError('Invalid raw AWS Lambda response')
  }

  const separated = splitResponseHeaders(headerSource)
  return {
    statusCode: response.status,
    ...(Object.keys(separated.headers).length === 0 ? {} : { headers: separated.headers }),
    ...(separated.cookies === undefined ? {} : { cookies: [...separated.cookies] }),
    ...(body === undefined ? {} : { body }),
    isBase64Encoded,
  }
}

function adapterReplacement(response: AWSLambdaResponse): AdapterResponse {
  return { status: response.statusCode, headers: {}, body: { kind: 'raw', value: response } }
}

function createLambdaHandler<
  const ContractType extends Contract,
  const Context extends object,
  Event extends APIGatewayProxyEventV2 = APIGatewayProxyEventV2,
>(
  implementation: ServerExecutableFor<ContractType, Context, 'aws-lambda', AWSLambdaAdapterContext<Event>>,
  options: AWSLambdaServerOptions<Event> = {}
): AWSLambdaHandler<Event> {
  assertAdapterContext(implementation.context, 'aws-lambda')
  const usesNativeContext = serverContextAdapterId(implementation.context) !== undefined
  const dispatch = createAdapterHandler(
    implementation,
    options.onError === undefined
      ? {}
      : {
          onError: async ({ hostContext, ...input }) => {
            const native = hostContext as AWSLambdaAdapterContext<Event>
            const replacement = await options.onError?.({
              ...input,
              ...native,
              defaultResponse: await lambdaResponse(input.defaultResponse),
            })
            return replacement === undefined ? undefined : adapterReplacement(replacement)
          },
        }
  )

  return async (event, lambdaContext) => {
    const nativeContext = { event, lambdaContext }
    let headers: Readonly<Record<string, string>> | undefined
    const input = {
      request: event,
      ...(usesNativeContext ? { contextInput: nativeContext } : {}),
      ...(options.onError === undefined ? {} : { hostContext: nativeContext }),
      method: event.requestContext.http.method,
      pathname: options.pathname?.(event) ?? event.rawPath,
      ...(event.rawQueryString.length === 0 ? {} : { query: new URLSearchParams(event.rawQueryString) }),
      readHeaders: () => (headers ??= eventHeaders(event)),
      readBody: (representation: string) => readEventBody(event, (headers ??= eventHeaders(event)), representation),
    }
    return lambdaResponse(await dispatch(input))
  }
}

let awsLambdaAdapterValue: unknown

/** Creates an AWS Lambda HTTP API v2 and Function URL adapter. */
export function awsLambdaAdapter<
  Event extends APIGatewayProxyEventV2 = APIGatewayProxyEventV2,
>(): AWSLambdaAdapter<Event> {
  awsLambdaAdapterValue ??= createServerAdapter('aws-lambda', { mount: createLambdaHandler })
  return awsLambdaAdapterValue as AWSLambdaAdapter<Event>
}
