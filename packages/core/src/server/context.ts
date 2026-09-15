import type { Awaitable, ContextFactory, ContractRouteMetadata } from '../context'
import type { Contract } from '../contract'

const adapter = Symbol()
declare const adapterInput: unique symbol

export type ServerContextRequirement<Id extends string = string, Input extends object = object> = {
  readonly [adapter]: Id
  readonly [adapterInput]?: Input
}

export type ServerAdapter<Id extends string = string, Input extends object = object> = ServerContextRequirement<
  Id,
  Input
> & {
  readonly context: <const Context extends object, ContractType extends Contract = Contract>(
    factory: (input: ServerContextInput<ContractType> & Input) => Awaitable<Context>
  ) => AdapterContextFactory<Id, Input, Context, ServerContextInput<ContractType>>
}

export type AdapterContextFactory<
  Id extends string,
  Input extends object,
  Context extends object,
  BaseInput extends object,
> = ((input: BaseInput & Input) => Awaitable<Context>) & ServerContextRequirement<Id, Input>

export type ServerContextAdapterId<Factory> =
  Factory extends ServerContextRequirement<infer Id extends string> ? Id : undefined

export type ServerContextAdapterInput<Factory> =
  Factory extends ServerContextRequirement<string, infer Input extends object> ? Input : object

/** Creates a setup-time adapter whose input type is supplied by an adapter package. */
export function createServerAdapter<const Id extends string, const Extension extends object = Record<never, never>>(
  id: Id,
  extension?: Extension
): ServerAdapter<Id> & Readonly<Extension> {
  if (id.length === 0) throw new TypeError('Adapter id must not be empty')
  const value = { ...extension } as ServerAdapter<Id> & Extension
  Object.defineProperty(value, adapter, { value: id })
  Object.defineProperty(value, 'context', {
    enumerable: true,
    value: (factory: (input: object) => Awaitable<object>) => bindAdapterContext(value, factory),
  })
  return Object.freeze(value) as unknown as ServerAdapter<Id> & Readonly<Extension>
}

export type { Awaitable, ContextFactory, ContractRouteMetadata as ServerRouteMetadata, RouteMetadata } from '../context'

export type ServerContextInput<ContractType extends Contract = Contract> = {
  readonly signal: AbortSignal
  readonly route: ContractRouteMetadata<ContractType>
}

export type ServerContextFactory<
  Context extends object = object,
  ContractType extends Contract = Contract,
  AdapterId extends string | undefined = undefined,
  AdapterInput extends object = object,
> = AdapterId extends string
  ? ((input: never) => Awaitable<Context>) & ServerContextRequirement<AdapterId, AdapterInput>
  : ContextFactory<ServerContextInput<ContractType>, Context>

/** Marks a context factory as requiring one host adapter without wrapping its request-time call. */
function bindAdapterContext<
  const Id extends string,
  Input extends object,
  Context extends object,
  BaseInput extends object,
>(
  requirement: ServerAdapter<Id, Input>,
  factory: (input: BaseInput & Input) => Awaitable<Context>
): AdapterContextFactory<Id, Input, Context, BaseInput> {
  const id =
    typeof requirement === 'object' && requirement !== null
      ? (requirement as Partial<ServerContextRequirement>)[adapter]
      : undefined
  if (typeof id !== 'string' || id.length === 0) {
    throw new TypeError('Server adapter must be created with createServerAdapter')
  }
  const existing = (factory as Partial<ServerContextRequirement>)[adapter]
  if (existing !== undefined) {
    if (existing !== id) throw new TypeError(`Context factory already requires the ${existing} adapter`)
    return factory as AdapterContextFactory<Id, Input, Context, BaseInput>
  }
  Object.defineProperty(factory, adapter, { value: id })
  return factory as AdapterContextFactory<Id, Input, Context, BaseInput>
}

/** Returns the native adapter required by a context factory, if any. */
export function serverContextAdapterId(factory: Function | undefined): string | undefined {
  return factory === undefined ? undefined : (factory as Partial<ServerContextRequirement>)[adapter]
}

/** Rejects a native context factory mounted by the wrong host adapter. */
export function assertAdapterContext(factory: Function | undefined, actual: string): void {
  const required = serverContextAdapterId(factory)
  if (required !== undefined && required !== actual) {
    throw new TypeError(`Server requires the ${required} adapter, but was mounted with ${actual}`)
  }
}
