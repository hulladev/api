import type { ContextFrom } from '../context'
import type { Contract, ContractRoutes } from '../contract'
import { contractSelection } from '../contract/state'
import type { ClientErrorMode } from '../declared-errors'
import { assertMiddlewares } from '../middleware'
import { isRecord } from '../object'
import type { ClientContextInput } from './context'
import { buildClientNode } from './creation'
import type { ClientMiddleware } from './middleware'
import type { ClientContractFor, ClientFor, ClientOptions, ClientRoutes, ClientSource } from './types'

type EmptyContext = Record<string, never>

export function createClient<
  const C extends Contract,
  const Factory extends (input: ClientContextInput<C>) => object | PromiseLike<object>,
  const Mode extends ClientErrorMode = 'return',
>(
  source: C,
  options: ClientOptions<ContextFrom<Factory>, NoInfer<C>, Mode> & { readonly context: Factory }
): ClientRoutes<C, C['routes'], Mode>
export function createClient<const C extends Contract, const Mode extends ClientErrorMode = 'return'>(
  source: C,
  options: ClientOptions<EmptyContext, NoInfer<C>, Mode> & { readonly context?: undefined }
): ClientRoutes<C, C['routes'], Mode>
export function createClient<
  const Source extends Exclude<ClientSource, Contract>,
  Context extends object = EmptyContext,
  const Mode extends ClientErrorMode = 'return',
>(source: Source, options: ClientOptions<Context, ClientContractFor<NoInfer<Source>>, Mode>): ClientFor<Source, Mode>
export function createClient(source: unknown, configuration: unknown): unknown {
  const options = configuration as ClientOptions<object, Contract, ClientErrorMode>
  const selection = contractSelection(source)
  if (!isRecord(options)) throw new TypeError('Client options must be an object')
  if (typeof options.transport !== 'function') throw new TypeError('Client transport must be a function')
  if (options.context !== undefined && typeof options.context !== 'function')
    throw new TypeError('Client context must be a function')
  if (options.errorMode !== undefined && options.errorMode !== 'return' && options.errorMode !== 'throw') {
    throw new TypeError('Client errorMode must be "return" or "throw"')
  }
  const middleware = options.middleware ?? []
  assertMiddlewares('Client', middleware)
  return buildClientNode(source as ClientSource, selection, { ...options, middleware: Object.freeze([...middleware]) })
}

/** Optional typing helper for middleware shared between separately constructed clients. */
export function clientMiddleware<const Source extends ClientSource, Context extends object = EmptyContext>(
  _source: Source,
  middleware: ClientMiddleware<Context, Contract<string, ContractRoutes, Source['$contract']['errors']>>
): ClientMiddleware<Context, Contract<string, ContractRoutes, Source['$contract']['errors']>> {
  assertMiddlewares('Client', [middleware])
  return middleware
}
