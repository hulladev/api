import type { CompiledContractRoute } from '../compiler'
import type { Awaitable, RouteMetadata } from '../context'
import type { Contract } from '../contract'
import { isDeclaredError } from '../declared-errors'
import { isPromiseLike } from '../execution'
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
  readonly bindings: readonly ServerHandlerBinding[]
}

type RuntimeHandler = (input: object) => Awaitable<unknown>

type RuntimeRoute = {
  readonly compiled: CompiledContractRoute
  readonly decodeInput: RuntimeInputDecoder
  readonly handler: RuntimeHandler
  readonly metadata: RouteMetadata
  readonly middlewares: readonly ServerMiddleware<object, Contract>[]
  readonly pattern: readonly string[]
  readonly errors?: RuntimeErrors
  readonly serializeResponse: RuntimeResponseSerializer
}

const middlewareErrors = {
  invalidMiddleware: () =>
    new ServerRuntimeError('invalid-server-response', 500, 'Server middleware must be a function'),
  multipleNext: () =>
    new ServerRuntimeError('invalid-server-response', 500, 'Server middleware called next() more than once'),
}

const emptyContext = Object.freeze({})
const neverAborted = new AbortController().signal

function compileRuntimeRoutes(contract: Contract, bindings: readonly ServerHandlerBinding[]): readonly RuntimeRoute[] {
  const errors = compileRuntimeErrors(contract)
  return bindings.map((binding) => {
    const compiled = binding.compiled
    return {
      compiled,
      decodeInput: compileRouteInput(compiled),
      handler: binding.handler as RuntimeHandler,
      metadata: { key: compiled.key, method: compiled.method, path: compiled.path },
      middlewares: binding.middlewares as readonly ServerMiddleware<object, Contract>[],
      pattern: compiled.path === '/' || compiled.path === '' ? [] : compiled.path.replace(/^\//, '').split('/'),
      ...(errors === undefined ? {} : { errors }),
      serializeResponse: compileResponseDispatcher(compiled.route.responses),
    }
  })
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
  if (!Array.isArray(server.bindings)) throw new TypeError('Adapter input must be a server implementation')
  const registeredBindings = server.bindings
  const compiled = {
    routes: compileRuntimeRoutes(server.contract, registeredBindings),
    server,
  }
  compiledAdapterImplementations.set(implementation, compiled)
  return compiled
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

async function executeRuntimeRoute(
  server: RuntimeServer,
  runtime: RuntimeRoute,
  parameters: Readonly<Record<string, string>>,
  input: AdapterRouteInput,
  options: AdapterRuntimeOptions
): Promise<AdapterResponse> {
  const signal = input.signal ?? neverAborted
  let phase: AdapterPhase = 'request'
  try {
    signal.throwIfAborted()
    const inputStep = runtime.decodeInput(parameters, input, input.query)
    const routeInput = isPromiseLike(inputStep) ? await inputStep : inputStep

    phase = 'context'
    const contextStep =
      server.context === undefined
        ? emptyContext
        : server.context({ ...input.contextInput, signal, route: runtime.metadata })
    const context = isPromiseLike(contextStep) ? await contextStep : contextStep
    if (!isRecord(context)) {
      throw new ServerRuntimeError('invalid-context', 500, 'Context must be an object')
    }
    signal.throwIfAborted()
    const sharedInput = {
      context,
      signal,
      response: createServerResponse,
      route: runtime.metadata,
      ...(runtime.errors === undefined ? {} : { errors: runtime.errors.factories }),
    }
    const handlerInput = { ...sharedInput, ...routeInput }
    phase = 'handler'
    const handlerStep =
      runtime.middlewares.length === 0
        ? runtime.handler(handlerInput)
        : dispatchMiddlewareSteps(
            runtime.middlewares,
            sharedInput,
            () => runtime.handler(handlerInput),
            middlewareErrors
          )

    const result = isPromiseLike(handlerStep) ? await handlerStep : handlerStep
    phase = 'response'
    const responseStep =
      runtime.errors !== undefined && isDeclaredError(result)
        ? serializeDeclaredError(runtime.errors, result)
        : runtime.serializeResponse(result)
    return isPromiseLike(responseStep) ? await responseStep : responseStep
  } catch (error) {
    if (phase === 'handler' && runtime.errors !== undefined && isDeclaredError(error)) {
      phase = 'response'
      try {
        return await serializeDeclaredError(runtime.errors, error)
      } catch (serializationError) {
        return recoverRouteError(serializationError, phase, runtime, input, options)
      }
    }
    return recoverRouteError(error, phase, runtime, input, options)
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
        execute: (input: AdapterRouteInput) =>
          executeRuntimeRoute(server, runtime, input.params ?? emptyParameters, input, options),
      })
    })
  )
  const runtime = Object.freeze({ routes: adapterRoutes })
  if (options.onError === undefined) compiledImplementation.runtime = runtime
  return runtime
}

/** Creates a catch-all dispatcher by composing the shared matcher with the route-level adapter runtime. */
export function createAdapterHandler<
  const ContractType extends Contract,
  const Context extends object,
  const AdapterId extends string | undefined,
>(
  implementation: ServerExecutable<ContractType, Context, AdapterId>,
  options: AdapterRuntimeOptions = {}
): AdapterHandler {
  const { routes, server } = compileAdapterImplementation(implementation)
  const routing = compileRoutingTable(routes)

  const handler = async (input: AdapterDispatchInput): Promise<AdapterResponse> => {
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

      return executeRuntimeRoute(server, selection.runtime, selection.parameters, input, options)
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
