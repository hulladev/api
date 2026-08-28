import type {
  HttpFunction as NativeGoogleCloudFunction,
  Request as NativeGoogleCloudFunctionsRequest,
  Response as NativeGoogleCloudFunctionsResponse,
} from '@google-cloud/functions-framework'
import type { Contract } from '@hulla/api'
import { createFetchHandler, type FetchServerErrorInput } from '@hulla/api/fetch'
import {
  createServerAdapter,
  type Awaitable,
  type ServerAdapter,
  type ServerContextInput,
  type ServerExecutableFor,
} from '@hulla/api/server'

export type GoogleCloudFunction = NativeGoogleCloudFunction
export type GoogleCloudFunctionsRequest = NativeGoogleCloudFunctionsRequest
export type GoogleCloudFunctionsResponse = NativeGoogleCloudFunctionsResponse

export type GoogleCloudFunctionsAdapterContext = {
  /** The Web request consumed by the shared Fetch executor. */
  readonly request: Request
  /** The native Functions Framework request, including `rawBody` and execution metadata. */
  readonly googleRequest: GoogleCloudFunctionsRequest
  readonly response: GoogleCloudFunctionsResponse
}

type GoogleCloudFunctionsHandlerContext = Omit<GoogleCloudFunctionsAdapterContext, 'request'>

export type GoogleCloudFunctionsContextInput<ContractType extends Contract> = ServerContextInput<ContractType> &
  GoogleCloudFunctionsAdapterContext

export type GoogleCloudFunctionsServerErrorInput = Omit<
  FetchServerErrorInput<GoogleCloudFunctionsAdapterContext>,
  'handlerContext'
> &
  GoogleCloudFunctionsAdapterContext

export type GoogleCloudFunctionsAdapterOptions = {
  readonly onError?: (input: GoogleCloudFunctionsServerErrorInput) => Awaitable<Response | undefined | void>
}

export type GoogleCloudFunctionsMountOptions = GoogleCloudFunctionsAdapterOptions

type GoogleCloudFunctionsMount = {
  <const ContractType extends Contract, const Context extends object>(
    implementation: ServerExecutableFor<
      ContractType,
      Context,
      'google-cloud-functions',
      GoogleCloudFunctionsAdapterContext
    >,
    options?: GoogleCloudFunctionsMountOptions
  ): GoogleCloudFunction
}

export type GoogleCloudFunctionsAdapter = ServerAdapter<
  'google-cloud-functions',
  GoogleCloudFunctionsAdapterContext
> & {
  readonly mount: GoogleCloudFunctionsMount
}

function getFirstHeaderValue(value: string | readonly string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : value?.[0]
}

function createRequestHeaders(request: GoogleCloudFunctionsRequest): Headers {
  const headers = new Headers()

  for (const [name, value] of Object.entries(request.headers)) {
    if (name.startsWith(':')) continue

    if (Array.isArray(value)) {
      for (const item of value) headers.append(name, item)
    } else if (value !== undefined) {
      headers.set(name, value)
    }
  }

  return headers
}

function createRequestUrl(request: GoogleCloudFunctionsRequest): string {
  const originalUrl = request.originalUrl || request.url || '/'
  if (/^https?:\/\//i.test(originalUrl)) return originalUrl

  const forwardedProtocol = getFirstHeaderValue(request.headers['x-forwarded-proto'])?.split(',')[0]?.trim()
  const protocol = forwardedProtocol || request.protocol || 'http'
  const host = request.get?.('host') || request.headers.host || 'localhost'
  const pathname = originalUrl.startsWith('/') ? originalUrl : `/${originalUrl}`

  return `${protocol}://${host}${pathname}`
}

function getRequestBody(request: GoogleCloudFunctionsRequest): BodyInit | undefined {
  if (request.rawBody !== undefined) {
    return request.rawBody as unknown as BodyInit
  }

  const body: unknown = request.body
  if (body === undefined || body === null) return undefined
  if (
    typeof body === 'string' ||
    body instanceof ArrayBuffer ||
    body instanceof Blob ||
    body instanceof FormData ||
    body instanceof URLSearchParams ||
    body instanceof Uint8Array
  ) {
    return body as BodyInit
  }

  return JSON.stringify(body)
}

function createWebRequest(request: GoogleCloudFunctionsRequest, method: string): Request {
  const headers = createRequestHeaders(request)
  const body = method === 'GET' || method === 'HEAD' ? undefined : getRequestBody(request)

  if (request.rawBody === undefined && body !== undefined) {
    headers.delete('content-length')
  }

  const init: RequestInit = {
    method,
    headers,
    ...(body === undefined ? {} : { body }),
    ...(request.abortController === undefined ? {} : { signal: request.abortController.signal }),
  }

  return new Request(createRequestUrl(request), init)
}

function waitForDrain(response: GoogleCloudFunctionsResponse): Promise<void> {
  return new Promise((resolve, reject) => {
    const onDrain = () => {
      cleanup()
      resolve()
    }
    const onClose = () => {
      cleanup()
      reject(new Error('The Google Cloud Functions response closed early.'))
    }
    const cleanup = () => {
      response.off('drain', onDrain)
      response.off('close', onClose)
    }

    response.once('drain', onDrain)
    response.once('close', onClose)
  })
}

function setResponseHeaders(source: Headers, response: GoogleCloudFunctionsResponse): void {
  const setCookies = source.getSetCookie()

  source.forEach((value, name) => {
    if (name !== 'set-cookie') response.setHeader(name, value)
  })

  if (setCookies.length > 0) response.setHeader('set-cookie', setCookies)
}

async function writeWebResponse(
  source: Response,
  response: GoogleCloudFunctionsResponse,
  suppressBody: boolean
): Promise<void> {
  response.statusCode = source.status
  setResponseHeaders(source.headers, response)

  if (suppressBody || source.body === null) {
    await source.body?.cancel()
    response.end()
    return
  }

  const reader = source.body.getReader()

  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      if (!response.write(chunk.value)) await waitForDrain(response)
    }

    response.end()
  } catch (error) {
    await reader.cancel(error).catch(() => undefined)
    throw error
  } finally {
    reader.releaseLock()
  }
}

function failTransport(error: unknown, response: GoogleCloudFunctionsResponse): void {
  if (response.writableEnded) return

  if (response.headersSent) {
    response.destroy(error instanceof Error ? error : undefined)
    return
  }

  response.statusCode = 500
  response.setHeader('content-type', 'text/plain; charset=utf-8')
  response.end('Internal Server Error')
}

function createGoogleCloudFunctionsHandler<const ContractType extends Contract, const Context extends object>(
  implementation: ServerExecutableFor<
    ContractType,
    Context,
    'google-cloud-functions',
    GoogleCloudFunctionsAdapterContext
  >,
  options: GoogleCloudFunctionsAdapterOptions
): GoogleCloudFunction {
  const handler = createFetchHandler<
    ContractType,
    Context,
    GoogleCloudFunctionsHandlerContext,
    'google-cloud-functions'
  >(implementation, {
    contextAdapter: 'google-cloud-functions',
    contextInput: (_request: Request, context: GoogleCloudFunctionsHandlerContext) => context,
    ...(options.onError === undefined
      ? {}
      : {
          onError: ({ handlerContext, ...input }: FetchServerErrorInput<GoogleCloudFunctionsHandlerContext>) =>
            options.onError?.({
              ...input,
              googleRequest: handlerContext.googleRequest,
              response: handlerContext.response,
            }),
        }),
  })

  return async (request, response) => {
    try {
      const method = request.method === 'HEAD' ? 'GET' : request.method
      const webRequest = createWebRequest(request, method)
      const webResponse = await handler(webRequest, {
        googleRequest: request,
        response,
      })
      await writeWebResponse(webResponse, response, request.method === 'HEAD')
    } catch (error) {
      failTransport(error, response)
    }
  }
}

let googleCloudFunctionsAdapterValue: unknown

function createGoogleCloudFunctionsAdapter(defaults: GoogleCloudFunctionsAdapterOptions): GoogleCloudFunctionsAdapter {
  return createServerAdapter('google-cloud-functions', {
    mount: <const ContractType extends Contract, const Context extends object>(
      implementation: ServerExecutableFor<
        ContractType,
        Context,
        'google-cloud-functions',
        GoogleCloudFunctionsAdapterContext
      >,
      options?: GoogleCloudFunctionsMountOptions
    ) =>
      createGoogleCloudFunctionsHandler(implementation, options === undefined ? defaults : { ...defaults, ...options }),
  }) as unknown as GoogleCloudFunctionsAdapter
}

export function googleCloudFunctionsAdapter(options?: GoogleCloudFunctionsAdapterOptions): GoogleCloudFunctionsAdapter {
  if (options !== undefined) return createGoogleCloudFunctionsAdapter({ ...options })
  googleCloudFunctionsAdapterValue ??= createGoogleCloudFunctionsAdapter({})
  return googleCloudFunctionsAdapterValue as GoogleCloudFunctionsAdapter
}
