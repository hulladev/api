import type { CompiledContractRoute } from '../compiler'
import type { Contract } from '../contract'
import { isRouteMount } from '../contract/state'
import type { ContractSelection } from '../contract/types'
import { errorFactories, type ClientErrorMode, type ErrorFactories } from '../declared-errors'
import { isPromiseLike } from '../execution'
import { dispatchMiddlewareSteps } from '../middleware'
import { hasOwn, isRecord, setOwn } from '../object'
import type { ClientContextInput, ClientContractRouteMetadata } from './context'
import { registerClientRoute } from './integration'
import type { ClientMiddleware, ClientMiddlewareInput } from './middleware'
import {
  compileClientRequest,
  type ClientRequestOptions,
  type ClientRequestCreator,
  type ClientTransport,
  type ClientTransportResponse,
} from './request'
import {
  ClientResponseError,
  compileClientErrorResponse,
  compileClientResponse,
  createClientResponse,
  type ClientResponseDecoder,
} from './response'
import type { ClientOptions, ClientSource } from './types'

const middlewareErrors = {
  invalidMiddleware: () => new TypeError('Client middleware must be a function'),
  multipleNext: () => new TypeError('Client middleware called next() more than once'),
}

type EmptyClientContext = Record<string, never>
const emptyContext = Object.freeze({}) as EmptyClientContext
type RuntimeRoute = {
  readonly compiled: CompiledContractRoute
  readonly createRequest: ClientRequestCreator
  readonly metadata: ClientContractRouteMetadata
  readonly responses: ReadonlyMap<number, ClientResponseDecoder>
  readonly errorFactories?: ErrorFactories<Contract['errors']>
}

function responseDecoder(runtime: RuntimeRoute, response: ClientTransportResponse): ClientResponseDecoder {
  const decoder = runtime.responses.get(response.status)
  if (decoder !== undefined) return decoder
  const route = runtime.compiled.route
  throw new ClientResponseError(
    'unexpected-status',
    response,
    `Response status ${response.status} is not declared for ${route.method} ${route.path}`
  )
}

async function executeRoute(
  runtime: RuntimeRoute,
  transport: ClientTransport,
  contextFactory: ((input: ClientContextInput) => object | PromiseLike<object>) | undefined,
  middlewares: readonly ClientMiddleware<object, Contract>[],
  input: Readonly<Record<string, unknown>>,
  options: ClientRequestOptions
): Promise<unknown> {
  const requestStep = runtime.createRequest(input, options)
  const request = isPromiseLike(requestStep) ? await requestStep : requestStep
  const contextStep = contextFactory === undefined ? emptyContext : contextFactory({ request, route: runtime.metadata })
  const context = isPromiseLike(contextStep) ? await contextStep : contextStep
  if (!isRecord(context)) throw new TypeError('Client context factory must return an object')
  const transportAndDecode = async () => {
    const response = await transport(request)
    try {
      const decoded = responseDecoder(runtime, response)(response)
      return isPromiseLike(decoded) ? await decoded : decoded
    } catch (error) {
      try {
        await response.dispose?.(error)
      } catch {
        // Cleanup must not replace the validation or decoding failure.
      }
      throw error
    }
  }

  if (middlewares.length === 0) return transportAndDecode()

  const middlewareInput = {
    context,
    response: createClientResponse,
    request,
    route: runtime.metadata,
    ...(runtime.errorFactories === undefined ? {} : { errors: runtime.errorFactories }),
  }

  return dispatchMiddlewareSteps<ClientMiddlewareInput<object, Contract>, unknown>(
    middlewares,
    middlewareInput,
    transportAndDecode,
    middlewareErrors
  )
}

function setClientRoute(target: Record<string, unknown>, key: readonly string[], value: unknown): void {
  if (key.length === 1) {
    setOwn(target, key[0]!, value)
    return
  }

  let parent = target

  for (const segment of key.slice(0, -1)) {
    const existing = hasOwn(parent, segment) ? parent[segment] : undefined
    if (existing !== undefined) {
      if (!isRecord(existing)) throw new TypeError(`Compiled client key "${key.join('.')}" collides with a route`)
      parent = existing as Record<string, unknown>
      continue
    }

    const nested: Record<string, unknown> = {}
    setOwn(parent, segment, nested)
    parent = nested
  }

  const routeKey = key.at(-1)
  if (routeKey === undefined) throw new TypeError('Compiled client route key must not be empty')
  setOwn(parent, routeKey, value)
}

export function buildClientNode(
  source: ClientSource,
  mount: ContractSelection,
  options: ClientOptions<object, Contract, ClientErrorMode>
): object {
  const { transport, headers, context: contextFactory, errorMode = 'return' } = options
  const middlewares = options.middleware ?? []
  const tree: Record<string, unknown> = {}
  const route = isRouteMount(mount, source)
  let errorResponses: ReadonlyMap<number, ClientResponseDecoder> | undefined
  if (Object.keys(mount.errors).length > 0) {
    const decoders = new Map<number, ClientResponseDecoder>()
    for (const [status, declarations] of Object.entries(mount.errors)) {
      decoders.set(Number(status), compileClientErrorResponse(Number(status), declarations, errorMode))
    }
    errorResponses = decoders
  }

  const factories = errorResponses === undefined ? undefined : errorFactories(mount.errors)
  for (const compiled of mount.routes) {
    const routeDefinition = compiled.route
    const hasInput =
      compiled.pathParameters.length > 0 ||
      'query' in routeDefinition ||
      'headers' in routeDefinition ||
      'body' in routeDefinition
    const responseEntries = Object.entries(routeDefinition.responses)
    const responses = new Map(errorResponses)
    for (const [status, response] of responseEntries) {
      responses.set(Number(status), compileClientResponse(response))
    }
    const runtime: RuntimeRoute = {
      compiled,
      createRequest: compileClientRequest(compiled, headers),
      metadata: { key: compiled.key, method: compiled.method, path: compiled.path } as ClientContractRouteMetadata,
      ...(factories === undefined ? {} : { errorFactories: factories }),
      responses,
    }

    const call = ((...args: readonly unknown[]) => {
      const input = (hasInput ? args[0] : {}) as Readonly<Record<string, unknown>>
      const requestOptions = (hasInput ? args[1] : args[0]) as ClientRequestOptions | undefined
      return executeRoute(runtime, transport, contextFactory, middlewares, input, requestOptions ?? {})
    }) as (...args: readonly unknown[]) => Promise<unknown>
    registerClientRoute(call, { hasInput })
    if (route) return call
    setClientRoute(tree, compiled.key.slice(mount.key.length), call)
  }

  const freezeTree = (node: Record<string, unknown>): object => {
    for (const value of Object.values(node)) if (isRecord(value)) freezeTree(value as Record<string, unknown>)
    return Object.freeze(node)
  }
  return freezeTree(tree)
}
