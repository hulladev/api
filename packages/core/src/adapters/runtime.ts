import type { CompiledContractRoute } from '../compiler'
import { getCompositionState } from '../composition'
import type { Awaitable, RouteMetadata } from '../context'
import type { Contract } from '../contract'
import type { CanonicalContractPlan } from '../contract/plan'
import { compileServerContract, type ServerRoutePlan } from '../contract/server-plan'
import { isDeclaredError } from '../declared-errors'
import { isPromiseLike, type ExecutionStep } from '../execution'
import { dispatchMiddlewareSteps } from '../middleware'
import { isRecord } from '../object'
import { ServerRuntimeError } from '../server/errors'
import type { ServerHandlerBinding } from '../server/implementation'
import type { ServerMiddleware } from '../server/middleware'
import { createServerResponse } from '../server/response'
import type { ServerExecutable } from '../server/types'
import {
  compileRuntimeErrors,
  errorResponse,
  serializeDeclaredError,
  simpleProblem,
  type RuntimeErrors,
} from './errors'
import { compileRouteInput, type RuntimeInputDecoder } from './input'
import { compileResponseDispatcher, type RuntimeResponseSerializer } from './response'
import { compileRoutingTable, emptyParameters, selectRoute } from './routing'
import type {
  AdapterDispatchInput,
  AdapterHandler,
  AdapterPhase,
  AdapterResponse,
  AdapterRouteInput,
  AdapterRuntime,
  AdapterRuntimeOptions,
} from './types'

type RuntimeServer = {
  readonly context?: (input: { readonly route: RouteMetadata } & Readonly<Record<string, unknown>>) => Awaitable<object>
  readonly contract: Contract
}

type RuntimeHandler = (input: object) => Awaitable<unknown>

type RuntimeRoute = {
  readonly execute: typeof executeRuntimeRoute
  readonly compiled: CompiledContractRoute
  readonly decodeInput?: RuntimeInputDecoder
  readonly handler: RuntimeHandler
  readonly hasInput: boolean
  readonly metadata: RouteMetadata
  readonly middlewares: readonly ServerMiddleware<object, Contract>[]
  readonly pattern: readonly string[]
  readonly readsQuery: boolean
  readonly errors?: RuntimeErrors
  readonly serializeResponse: RuntimeResponseSerializer
}

const emptyContext = Object.freeze({})
const neverAborted = new AbortController().signal
const emptyQuery = {}
const emptyRouteInput = {}

function compileRuntimeRoutes(
  contractPlan: CanonicalContractPlan<ServerRoutePlan>,
  registeredBindings: readonly ServerHandlerBinding[],
  server: RuntimeServer
): readonly RuntimeRoute[] {
  const routes: RuntimeRoute[] = []
  const errors = compileRuntimeErrors(contractPlan)
  for (let index = 0; index < contractPlan.routes.length; index++) {
    const plan = contractPlan.routes[index]!
    const compiled = plan.compiled
    const binding = registeredBindings[index]!

    const runtime = {
      execute:
        server.context === undefined && binding.middlewares.length === 0 && errors === undefined
          ? executeSimpleRoute
          : executeRuntimeRoute,
      compiled,
      ...(plan.hasInput ? { decodeInput: compileRouteInput(plan) } : {}),
      handler: binding.handler as RuntimeHandler,
      hasInput: plan.hasInput,
      metadata: plan.metadata,
      middlewares: binding.middlewares as readonly ServerMiddleware<object, Contract>[],
      pattern: plan.pattern,
      readsQuery: plan.decodeQuery !== undefined,
      ...(errors === undefined ? {} : { errors }),
      serializeResponse: compileResponseDispatcher(plan.responses),
    }
    routes.push(runtime)
  }

  return routes
}
type CompiledAdapterImplementation = {
  readonly routes: readonly RuntimeRoute[]
  readonly server: RuntimeServer
  runtime?: AdapterRuntime
}

const compiledAdapterImplementations = new WeakMap<object, CompiledAdapterImplementation>()

function compileAdapterImplementation(implementation: object): CompiledAdapterImplementation {
  const cached = compiledAdapterImplementations.get(implementation)
  if (cached !== undefined) return cached

  const server = implementation as unknown as RuntimeServer
  const state = getCompositionState<ServerHandlerBinding>(implementation)
  if (state === undefined) throw new TypeError('Adapter input must be a server implementation')
  const registeredBindings = state.bindings
  const selectedRoutes = registeredBindings.map((binding) => binding.compiled)
  const contractPlan = compileServerContract(server.contract, selectedRoutes)
  const compiled = {
    routes: compileRuntimeRoutes(contractPlan, registeredBindings, server),
    server,
  }
  compiledAdapterImplementations.set(implementation, compiled)
  return compiled
}

/** Selected at compilation only when context, middleware and declared errors are absent. */
function executeSimpleRoute(
  _server: RuntimeServer,
  runtime: RuntimeRoute,
  parameters: Readonly<Record<string, string>>,
  input: AdapterRouteInput,
  options: AdapterRuntimeOptions
): ExecutionStep<AdapterResponse> {
  const signal = input.signal ?? neverAborted
  let phase: AdapterPhase = 'request'
  const failed = (error: unknown) => recoverRouteError(error, phase, runtime, input, options)
  const invoke = (routeInput: Record<string, unknown>) => {
    // The generic executor checks abort after its context stage, including after input suspension.
    phase = 'context'
    signal.throwIfAborted()
    phase = 'handler'
    const shared = { context: emptyContext, signal, response: createServerResponse, route: runtime.metadata }
    return runtime.handler(runtime.hasInput ? { ...shared, ...routeInput } : shared)
  }
  const serialize = (value: unknown) => {
    phase = 'response'
    return runtime.serializeResponse(value)
  }
  const resume = async (pending: PromiseLike<unknown>, completed: 'request' | 'handler' | 'response') => {
    try {
      let value = await pending
      if (completed === 'request') {
        value = invoke(value as Record<string, unknown>)
        if (isPromiseLike(value)) value = await value
      }
      if (completed !== 'response') {
        value = serialize(value)
        if (isPromiseLike(value)) value = await value
      }
      return value as AdapterResponse
    } catch (error) {
      return failed(error)
    }
  }
  try {
    signal.throwIfAborted()
    const routeInput = runtime.hasInput
      ? runtime.decodeInput!(parameters, input, runtime.readsQuery ? (input.query ?? emptyQuery) : undefined)
      : emptyRouteInput
    if (isPromiseLike(routeInput)) return resume(routeInput, 'request')
    const value = invoke(routeInput)
    if (isPromiseLike(value)) return resume(value, 'handler')
    const result = serialize(value)
    return isPromiseLike(result) ? resume(result, 'response') : result
  } catch (error) {
    return failed(error)
  }
}

async function recoverRouteError(
  error: unknown,
  phase: AdapterPhase,
  runtime: RuntimeRoute,
  input: AdapterRouteInput,
  options: AdapterRuntimeOptions
): Promise<AdapterResponse> {
  const fallback = errorResponse(error, phase)
  try {
    return (
      (await options.onError?.({
        error,
        phase,
        request: input.request,
        ...(input.hostContext === undefined ? {} : { hostContext: input.hostContext }),
        route: runtime.metadata,
        defaultResponse: fallback,
      })) ?? fallback
    )
  } catch {
    return fallback
  }
}

function executeRuntimeRoute(
  server: RuntimeServer,
  runtime: RuntimeRoute,
  parameters: Readonly<Record<string, string>>,
  input: AdapterRouteInput,
  options: AdapterRuntimeOptions
): ExecutionStep<AdapterResponse> {
  const signal = input.signal ?? neverAborted
  let phase: AdapterPhase = 'request'

  const serialize = (result: unknown): ExecutionStep<AdapterResponse> => {
    phase = 'response'
    return runtime.errors !== undefined && isDeclaredError(result)
      ? serializeDeclaredError(runtime.errors, result)
      : runtime.serializeResponse(result)
  }

  const invoke = (context: object, routeInput: Record<string, unknown>): ExecutionStep<unknown> => {
    if (!isRecord(context)) {
      throw new ServerRuntimeError('invalid-context', 500, 'Context must be an object')
    }
    const sharedInput =
      runtime.errors === undefined
        ? { context, signal, response: createServerResponse, route: runtime.metadata }
        : { context, signal, errors: runtime.errors.factories, response: createServerResponse, route: runtime.metadata }
    const handlerInput = runtime.hasInput ? { ...sharedInput, ...routeInput } : sharedInput

    signal.throwIfAborted()
    phase = 'handler'
    return runtime.middlewares.length === 0
      ? runtime.handler(handlerInput)
      : dispatchMiddlewareSteps(runtime.middlewares, sharedInput, () => runtime.handler(handlerInput), {
          invalidMiddleware: () =>
            new ServerRuntimeError('invalid-server-response', 500, 'Server middleware must be a function'),
          multipleNext: () =>
            new ServerRuntimeError('invalid-server-response', 500, 'Server middleware called next() more than once'),
        })
  }

  const contextualize = (): ExecutionStep<object> => {
    phase = 'context'
    return server.context === undefined
      ? emptyContext
      : server.context({ ...input.contextInput, signal, route: runtime.metadata })
  }

  const failed = async (error: unknown): Promise<AdapterResponse> => {
    let caughtError = error
    if (phase === 'handler' && runtime.errors !== undefined && isDeclaredError(error)) {
      try {
        phase = 'response'
        const response = serializeDeclaredError(runtime.errors, error)
        return isPromiseLike(response) ? await response : response
      } catch (serializationError) {
        caughtError = serializationError
      }
    }
    return recoverRouteError(caughtError, phase, runtime, input, options)
  }

  // Once execution suspends, keep subsequent awaits in one continuation instead
  // of building a Promise chain across each internal adapter stage.
  const resume = async (
    pending: PromiseLike<unknown>,
    completed: 'request' | 'context' | 'handler' | 'response',
    routeInput: Record<string, unknown> = emptyRouteInput
  ): Promise<AdapterResponse> => {
    try {
      let value = await pending
      if (completed === 'request') {
        routeInput = value as Record<string, unknown>
        value = contextualize()
        if (isPromiseLike(value)) value = await value
      }
      if (completed === 'request' || completed === 'context') {
        value = invoke(value as object, routeInput)
        if (isPromiseLike(value)) value = await value
      }
      if (completed !== 'response') {
        value = serialize(value)
        if (isPromiseLike(value)) value = await value
      }
      return value as AdapterResponse
    } catch (error) {
      return failed(error)
    }
  }

  // Public adapters establish the Promise boundary after internal composition.
  try {
    signal.throwIfAborted()
    const query = runtime.readsQuery ? (input.query ?? emptyQuery) : undefined
    const routeInput = runtime.hasInput ? runtime.decodeInput!(parameters, input, query) : emptyRouteInput
    if (isPromiseLike(routeInput)) return resume(routeInput, 'request')
    const context = contextualize()
    if (isPromiseLike(context)) return resume(context, 'context', routeInput)
    const result = invoke(context, routeInput)
    if (isPromiseLike(result)) return resume(result, 'handler')
    const response = serialize(result)
    return isPromiseLike(response) ? resume(response, 'response') : response
  } catch (error) {
    return failed(error)
  }
}

/** Compiles a transport-neutral executor for every route selected by an implementation or fragment. */
export function createAdapterRuntime<
  const ContractType extends Contract,
  const Context extends object,
  const AdapterId extends string | undefined,
>(
  implementation: ServerExecutable<ContractType, Context, AdapterId>,
  options: AdapterRuntimeOptions = {}
): AdapterRuntime {
  const compiledImplementation = compileAdapterImplementation(implementation)
  if (options.onError === undefined && compiledImplementation.runtime !== undefined) {
    return compiledImplementation.runtime
  }
  const { routes, server } = compiledImplementation
  const adapterRoutes = Object.freeze(
    routes.map((runtime) => {
      const compiled = runtime.compiled
      return Object.freeze({
        key: compiled.key,
        method: compiled.method,
        path: compiled.path,
        execute: (input: AdapterRouteInput) => {
          const parameters = input.params ?? emptyParameters
          try {
            return Promise.resolve(runtime.execute(server, runtime, parameters, input, options))
          } catch (error) {
            return Promise.reject(error)
          }
        },
      })
    })
  )
  const runtime = Object.freeze({ routes: adapterRoutes })
  if (options.onError === undefined) compiledImplementation.runtime = runtime
  return runtime
}

/** Creates a catch-all dispatcher by composing the shared matcher with the route-level adapter runtime. */
export function createAdapterDispatcher<
  const ContractType extends Contract,
  const Context extends object,
  const AdapterId extends string | undefined,
>(
  implementation: ServerExecutable<ContractType, Context, AdapterId>,
  options: AdapterRuntimeOptions = {}
): (input: AdapterDispatchInput) => ExecutionStep<AdapterResponse> {
  const { routes, server } = compileAdapterImplementation(implementation)
  const routing = compileRoutingTable(routes)

  const handler = (input: AdapterDispatchInput): ExecutionStep<AdapterResponse> => {
    try {
      if (typeof input.method !== 'string' || typeof input.pathname !== 'string') {
        throw new TypeError('Adapter input must provide a method and pathname')
      }
      const selection = selectRoute(routing, input.pathname, input.method.toUpperCase())
      if ('allowed' in selection) {
        if (selection.allowed.length === 0) return simpleProblem(404, 'route-not-found', 'Route not found')
        return simpleProblem(405, 'method-not-allowed', 'Method not allowed', {
          allow: selection.allowed.join(', '),
        })
      }

      return selection.runtime.execute(server, selection.runtime, selection.parameters, input, options)
    } catch (error) {
      return recover(error, input)
    }
  }

  const recover = async (error: unknown, input: AdapterDispatchInput): Promise<AdapterResponse> => {
    const request = input.request
    const fallback = errorResponse(error, 'routing')
    let replacement: AdapterResponse | undefined | void
    try {
      replacement = await options.onError?.({
        error,
        phase: 'routing',
        request,
        ...(input.hostContext === undefined ? {} : { hostContext: input.hostContext }),
        defaultResponse: fallback,
      })
    } catch {
      return fallback
    }
    return replacement ?? fallback
  }

  return handler
}

/** Creates a Promise-returning dispatcher for external host adapters. */
export function createAdapterHandler<
  const ContractType extends Contract,
  const Context extends object,
  const AdapterId extends string | undefined,
>(
  implementation: ServerExecutable<ContractType, Context, AdapterId>,
  options: AdapterRuntimeOptions = {}
): AdapterHandler {
  const dispatch = createAdapterDispatcher(implementation, options)
  return (input) => {
    try {
      return Promise.resolve(dispatch(input))
    } catch (error) {
      return Promise.reject(error)
    }
  }
}
