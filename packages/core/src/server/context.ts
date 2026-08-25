import type { Awaitable, ContextFactory, ContractRouteMetadata } from '../context'
import type { Contract } from '../contract'

const adapter = Symbol()
declare const adapterInput: unique symbol

export type ServerContextRequirement<Id extends string = string, Input extends object = object> = {
  readonly [adapter]: Id
  readonly [adapterInput]?: Input
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

export type { Awaitable, ContextFactory, ContractRouteMetadata as ServerRouteMetadata, RouteMetadata } from '../context'

export type ServerContextInput<ContractType extends Contract = Contract> = {
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

/** Marks a context factory as requiring one host adapter without allocating a descriptor. */
export function bindAdapterContext<
  const Id extends string,
  Input extends object,
  Context extends object,
  BaseInput extends object,
>(
  id: Id,
  factory: (input: BaseInput & Input) => Awaitable<Context>
): AdapterContextFactory<Id, Input, Context, BaseInput> {
  if (id.length === 0) throw new TypeError('Adapter id must not be empty')
  Object.defineProperty(factory, adapter, { value: id })
  return factory as AdapterContextFactory<Id, Input, Context, BaseInput>
}

/** Rejects a native context factory mounted by the wrong host adapter. */
export function assertAdapterContext(factory: Function | undefined, actual: string): void {
  const required = factory === undefined ? undefined : (factory as Partial<ServerContextRequirement>)[adapter]
  if (required !== undefined && required !== actual) {
    throw new TypeError(`Server requires the ${required} adapter, but was mounted with ${actual}`)
  }
}
