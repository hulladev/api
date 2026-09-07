import type { CompiledContractRoute } from '../compiler'
import { getCompositionState, isScopeDescendant, type CompositionScope } from '../composition'
import type { Contract, ContractRoute } from '../contract'
import { compileClientContract } from '../contract/client-plan'
import {
  compileContractRoutes,
  findContractMount,
  isContractMount,
  isRouteMount,
  type ContractMount,
} from '../contract/state'
import type { ClientErrorMode, ErrorFactories } from '../declared-errors'
import { isPromiseLike } from '../execution'
import { dispatchMiddlewareSteps, type MiddlewarePlan, routeMiddlewares } from '../middleware'
import { hasOwn, isRecord, setOwn } from '../object'
import type { ClientContextInput, ClientContractRouteMetadata } from './context'
import { registerClientRoute } from './integration'
import type { ClientMiddleware, ClientMiddlewareInput } from './middleware'
import {
  compileClientRequest,
  type ClientHeaders,
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

export type ClientRouteBinding = {
  readonly call: (...args: readonly unknown[]) => Promise<unknown>
  readonly compiled: CompiledContractRoute
}

export type ClientScope = CompositionScope

type EmptyClientContext = Record<string, never>
const emptyContext = Object.freeze({}) as EmptyClientContext
type RuntimeRoute = {
  readonly compiled: CompiledContractRoute
  readonly createRequest: ClientRequestCreator
  readonly metadata: ClientContractRouteMetadata
  readonly responseDecoder?: ClientResponseDecoder
  readonly responseStatus?: number
  readonly responses?: ReadonlyMap<number, ClientResponseDecoder>
  readonly errorFactories?: ErrorFactories<Contract['errors']>
}

function responseDecoder(runtime: RuntimeRoute, response: ClientTransportResponse): ClientResponseDecoder {
  const decoder =
    runtime.responseStatus === response.status ? runtime.responseDecoder : runtime.responses?.get(response.status)
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
  const decode = (response: ClientTransportResponse) => {
    const failed = async (error: unknown): Promise<never> => {
      try {
        await response.dispose?.(error)
      } catch {
        /* Preserve the primary decode failure. */
      }
      throw error
    }
    try {
      const result = responseDecoder(runtime, response)(response)
      return isPromiseLike(result) ? Promise.resolve(result).catch(failed) : result
    } catch (error) {
      return failed(error)
    }
  }
  const transportAndDecode = () => {
    const response = transport(request)
    return isPromiseLike(response) ? Promise.resolve(response).then(decode) : decode(response)
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
    {
      invalidMiddleware: () => new TypeError('Client middleware must be a function'),
      multipleNext: () => new TypeError('Client middleware called next() more than once'),
    }
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

function displayKey(key: readonly string[]): string {
  return key.join('.')
}

export function mountedClientNode(contract: Contract, node: unknown): ContractMount {
  const mount = findContractMount(contract, node)
  if (mount === null) throw new TypeError('Client creation node must belong to its client contract')
  if (mount === undefined) {
    throw new TypeError('Client node is not mounted in this contract')
  }
  return mount
}

export function buildClientNode(
  contract: Contract,
  node: Contract | ContractRoute,
  mount: ContractMount,
  transport: ClientTransport,
  headers: ClientHeaders | undefined,
  contextFactory: ((input: ClientContextInput) => object | PromiseLike<object>) | undefined,
  middlewarePlan: MiddlewarePlan<ClientMiddleware<object, Contract>, CompiledContractRoute>,
  errorMode: ClientErrorMode
): { readonly bindings: readonly ClientRouteBinding[]; readonly value: object } {
  const tree: Record<string, unknown> = {}
  const root = isContractMount(mount)
  const route = isRouteMount(mount, node)
  const contractPlan = compileClientContract(contract, root ? undefined : mount.routes)
  const selectedPlans = contractPlan.routes
  const bindings: ClientRouteBinding[] | undefined = root ? undefined : []
  let errorResponses: ReadonlyMap<number, ClientResponseDecoder> | undefined
  if (contractPlan.errors.length > 0) {
    const decoders = new Map<number, ClientResponseDecoder>()
    for (const [status, declarations] of contractPlan.errors) {
      decoders.set(status, compileClientErrorResponse(status, declarations, errorMode))
    }
    errorResponses = decoders
  }

  for (const plan of selectedPlans) {
    const compiled = plan.compiled
    const responseEntries = plan.responses
    let responseStatus: number | undefined
    let responseDecoder: ClientResponseDecoder | undefined
    let responses: ReadonlyMap<number, ClientResponseDecoder> | undefined
    if (errorResponses === undefined && responseEntries.length === 1) {
      const [status, response] = responseEntries[0]!
      responseStatus = status
      responseDecoder = compileClientResponse(response)
    } else {
      const responseMap = new Map(errorResponses)
      for (const [status, response] of responseEntries) {
        responseMap.set(status, compileClientResponse(response))
      }
      responses = responseMap
    }
    const runtime: RuntimeRoute = {
      compiled,
      createRequest: compileClientRequest(plan, headers),
      metadata: plan.metadata as ClientContractRouteMetadata,
      ...(contractPlan.errors.length === 0 ? {} : { errorFactories: contractPlan.errorFactories }),
      ...(responses === undefined
        ? { responseDecoder: responseDecoder!, responseStatus: responseStatus! }
        : { responses }),
    }
    const middlewares = routeMiddlewares(middlewarePlan, compiled)

    const call = ((...args: readonly unknown[]) => {
      const input = (plan.hasInput ? args[0] : {}) as Readonly<Record<string, unknown>>
      const requestOptions = (plan.hasInput ? args[1] : args[0]) as ClientRequestOptions | undefined
      return executeRoute(runtime, transport, contextFactory, middlewares, input, requestOptions ?? {})
    }) as (...args: readonly unknown[]) => Promise<unknown>
    registerClientRoute(call, { hasInput: plan.hasInput })
    bindings?.push({ call, compiled })
    if (!route) setClientRoute(tree, compiled.key.slice(mount.key.length), call)
  }

  if (route) {
    const call = bindings?.[0]?.call
    if (call === undefined) throw new TypeError(`Client route "${displayKey(mount.key)}" is not compiled`)
    return { bindings: bindings ?? [], value: call }
  }

  return { bindings: bindings ?? [], value: tree }
}

export function composeClientFragments(
  contract: Contract,
  scope: ClientScope,
  fragments: readonly object[]
): Readonly<Record<string, unknown>> {
  const tree: Record<string, unknown> = {}
  const registered = new Set<CompiledContractRoute>()

  for (const fragment of fragments) {
    const state = getCompositionState<ClientRouteBinding, ClientScope>(fragment)
    if (state === undefined || state.scope.owner !== scope.owner) {
      throw new TypeError('Client creation fragment belongs to a different client definition')
    }
    if (!isScopeDescendant(state.scope, scope)) {
      throw new TypeError('Client fragment has an incompatible middleware scope')
    }

    for (const binding of state.bindings) {
      const key = binding.compiled.key
      const displayed = displayKey(key)
      if (registered.has(binding.compiled)) throw new TypeError(`Client route "${displayed}" is created more than once`)
      registered.add(binding.compiled)
      setClientRoute(tree, key, binding.call)
    }
  }

  const contractRoutes = compileContractRoutes(contract)
  const missing =
    registered.size === contractRoutes.length
      ? []
      : contractRoutes.filter((route) => !registered.has(route)).map(({ key }) => displayKey(key))
  if (missing.length > 0) {
    throw new TypeError(`Missing client ${missing.length === 1 ? 'route' : 'routes'}: ${missing.join(', ')}`)
  }

  return tree
}
