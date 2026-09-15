import type { HttpHandler, HttpRequest, HttpResponse, HttpResponseInit, InvocationContext } from '@azure/functions'
import type { Contract } from '@hulla/api'
import { toFetchHeaders } from '@hulla/api/adapters'
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

type AzureFunctionsAdapterContext = {
  readonly invocationContext: InvocationContext
  readonly request: HttpRequest
}

export type AzureFunctionsContextInput<ContractType extends Contract = Contract> = ServerContextInput<ContractType> &
  AzureFunctionsAdapterContext

export type AzureFunctionsResponse = HttpResponseInit | HttpResponse

export type AzureFunctionsDefaultResponse = Omit<HttpResponseInit, 'status'> & {
  readonly status: number
}

export type AzureFunctionsServerErrorInput = Omit<AdapterErrorInput, 'defaultResponse' | 'hostContext' | 'request'> &
  AzureFunctionsAdapterContext & {
    readonly defaultResponse: AzureFunctionsDefaultResponse
  }

export type AzureFunctionsServerOptions = {
  readonly onError?: (input: AzureFunctionsServerErrorInput) => Awaitable<AzureFunctionsResponse | undefined | void>
}

export type AzureFunctionsAdapter = ServerAdapter<'azure-functions', AzureFunctionsAdapterContext> & {
  readonly mount: <const ContractType extends Contract, const Context extends object>(
    implementation: ServerExecutableFor<ContractType, Context, 'azure-functions', AzureFunctionsAdapterContext>,
    options?: AzureFunctionsServerOptions
  ) => HttpHandler
}

async function readRequestBody(request: HttpRequest, representation: string): Promise<unknown> {
  switch (representation) {
    case 'json':
      return request.json()
    case 'text':
      return request.text()
    case 'bytes':
      return new Uint8Array(await request.arrayBuffer())
    case 'form-data':
      return request.formData()
    default:
      throw new TypeError(`Unsupported Azure Functions request body representation ${representation}`)
  }
}

function rawAzureResponse(body: AdapterResponseBody, status: number): AzureFunctionsResponse | undefined {
  if (body.kind !== 'raw') return undefined
  const value = body.value as Partial<AzureFunctionsResponse>
  if (typeof value !== 'object' || value === null || value.status !== status) {
    throw new TypeError('Raw Azure Functions response status must match its declared contract status')
  }
  return value as AzureFunctionsResponse
}

function azureResponse(response: AdapterResponse): AzureFunctionsResponse {
  const raw = rawAzureResponse(response.body, response.status)
  if (raw !== undefined) return raw

  const base: HttpResponseInit = {
    status: response.status,
    ...(Object.keys(response.headers).length === 0 ? {} : { headers: toFetchHeaders(response.headers) }),
  }
  switch (response.body.kind) {
    case 'empty':
      return base
    case 'json':
      return { ...base, jsonBody: response.body.value }
    case 'text':
      if (typeof response.body.value !== 'string') {
        throw new TypeError('Text adapter response body must be a string')
      }
      return { ...base, body: response.body.value }
    case 'bytes':
      if (!(response.body.value instanceof Uint8Array)) {
        throw new TypeError('Byte adapter response body must be Uint8Array')
      }
      return { ...base, body: response.body.value }
    case 'form-data':
      if (!(response.body.value instanceof FormData)) {
        throw new TypeError('Form data response body must be FormData')
      }
      return { ...base, body: response.body.value }
    case 'stream':
      return { ...base, body: response.body.value as AsyncIterable<Uint8Array> }
    case 'raw':
      throw new TypeError('Invalid raw Azure Functions response')
  }
}

function adapterReplacement(response: AzureFunctionsResponse): AdapterResponse {
  const status = response.status
  if (typeof status !== 'number') throw new TypeError('Azure Functions error replacement must define a status')
  return { status, headers: {}, body: { kind: 'raw', value: response } }
}

function createHttpHandler<const ContractType extends Contract, const Context extends object>(
  implementation: ServerExecutableFor<ContractType, Context, 'azure-functions', AzureFunctionsAdapterContext>,
  options: AzureFunctionsServerOptions = {}
): HttpHandler {
  assertAdapterContext(implementation.context, 'azure-functions')
  const usesNativeContext = serverContextAdapterId(implementation.context) !== undefined
  const dispatch = createAdapterHandler(
    implementation,
    options.onError === undefined
      ? {}
      : {
          onError: async ({ hostContext, ...input }) => {
            const native = hostContext as AzureFunctionsAdapterContext
            const replacement = await options.onError?.({
              ...input,
              ...native,
              defaultResponse: azureResponse(input.defaultResponse) as AzureFunctionsDefaultResponse,
            })
            return replacement === undefined ? undefined : adapterReplacement(replacement)
          },
        }
  )

  return async (request, invocationContext) => {
    const nativeContext = { invocationContext, request }
    let headers: Readonly<Record<string, string>> | undefined
    const result = await dispatch({
      request,
      ...(usesNativeContext ? { contextInput: nativeContext } : {}),
      ...(options.onError === undefined ? {} : { hostContext: nativeContext }),
      method: request.method,
      pathname: new URL(request.url).pathname,
      ...(request.query.size === 0 ? {} : { query: request.query }),
      readHeaders: () => (headers ??= Object.fromEntries(request.headers.entries())),
      readBody: (representation) => readRequestBody(request, representation),
    })
    return azureResponse(result)
  }
}

let azureFunctionsAdapterValue: AzureFunctionsAdapter | undefined

/** Creates an Azure Functions v4 HTTP trigger adapter. */
export function azureFunctionsAdapter(): AzureFunctionsAdapter {
  return (azureFunctionsAdapterValue ??= createServerAdapter('azure-functions', {
    mount: createHttpHandler,
  }) as unknown as AzureFunctionsAdapter)
}
