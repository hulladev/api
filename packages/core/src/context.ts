import type { CompiledContractRouteFor } from './compiler'
import type { Contract } from './contract'
import type { ExecutionStep } from './execution'
import type { Route } from './route'

export type Awaitable<Value> = ExecutionStep<Value>

export type RouteMetadata<
  Key extends readonly string[] = readonly string[],
  Method extends Route['method'] = Route['method'],
  Path extends string = string,
> = {
  readonly key: Key
  readonly method: Method
  readonly path: Path
}

type MetadataForCompiledRoute<CompiledRoute> = CompiledRoute extends {
  readonly key: infer Key extends readonly string[]
  readonly method: infer Method extends Route['method']
  readonly path: infer Path extends string
}
  ? RouteMetadata<Key, Method, Path>
  : never

export type ContractRouteMetadata<ContractType extends Contract = Contract> = MetadataForCompiledRoute<
  CompiledContractRouteFor<ContractType>
>

export type ContextInput<ContractType extends Contract = Contract, RequestType = unknown> = {
  readonly request: RequestType
  readonly route: ContractRouteMetadata<ContractType>
}

export type ContextFactory<Input, Context extends object> = (input: Input) => Awaitable<Context>

export type ContextFrom<Factory extends (...args: never[]) => unknown> = Awaited<ReturnType<Factory>>
