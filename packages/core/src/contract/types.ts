import type { CompiledContractRoute } from '../compiler'
import type { ErrorStatusMap, NormalizedErrorStatusMap } from '../declared-errors'
import type { Route } from './route'
import type { AnyRouter, RouterRoutes } from './router'

export type ContractRoute = Route | AnyRouter

export type ContractRoutes = Readonly<Record<string, ContractRoute>>

/** Public selection metadata. Contains declarations and schemas, never request state. */
export type ContractSelection<
  Key extends readonly string[] = readonly string[],
  Errors extends NormalizedErrorStatusMap = NormalizedErrorStatusMap,
> = {
  readonly key: Key
  readonly routes: readonly CompiledContractRoute[]
  readonly errors: Readonly<Errors>
}

export type ContractNodeIdentity<
  Key extends readonly string[],
  Errors extends NormalizedErrorStatusMap = NormalizedErrorStatusMap,
> = {
  readonly $contract: ContractSelection<Key, Errors>
}

type MountedRouter<
  Definition extends AnyRouter,
  Key extends readonly string[],
  Errors extends NormalizedErrorStatusMap,
> = Definition &
  ContractNodeIdentity<Key, Errors> & {
    readonly [Child in keyof RouterRoutes<Definition>]: Child extends keyof Definition
      ? MountedContractRoute<Extract<Definition[Child], ContractRoute>, readonly [...Key, Child & string], Errors>
      : never
  }

type MountedContractRoute<
  Definition extends ContractRoute,
  Key extends readonly string[],
  Errors extends NormalizedErrorStatusMap,
> = Definition extends Route
  ? Definition & ContractNodeIdentity<Key, Errors>
  : Definition extends AnyRouter
    ? MountedRouter<Definition, Key, Errors>
    : never

export type MountedContractRoutes<
  Routes extends ContractRoutes,
  Errors extends NormalizedErrorStatusMap = NormalizedErrorStatusMap,
> = {
  readonly [Key in keyof Routes]: MountedContractRoute<Routes[Key], readonly [Key & string], Errors>
}

type ContractRoutesFor<
  Routes extends ContractRoutes,
  Errors extends NormalizedErrorStatusMap,
> = string extends keyof Routes ? Readonly<Routes> : Readonly<MountedContractRoutes<Routes, Errors>>

export type Contract<
  BasePath extends string = string,
  Routes extends ContractRoutes = ContractRoutes,
  Errors extends NormalizedErrorStatusMap = NormalizedErrorStatusMap,
> = {
  readonly basePath: BasePath
  readonly routes: ContractRoutesFor<Routes, Errors>
  readonly errors: Readonly<Errors>
} & ContractNodeIdentity<readonly [], Errors>

type NestedContractNode<Definition> = Definition extends AnyRouter
  ?
      | Definition
      | {
          [Key in Exclude<keyof Definition, '$meta' | '$contract'>]: NestedContractNode<Definition[Key]>
        }[Exclude<keyof Definition, '$meta' | '$contract'>]
  : Definition

export type ContractNodeFor<ContractType extends Contract> =
  | ContractType
  | {
      [Key in keyof ContractType['routes']]: NestedContractNode<ContractType['routes'][Key]>
    }[keyof ContractType['routes']]

export type ContractNodeKey<Node> = Node extends {
  readonly $contract: { readonly key: infer Key extends readonly string[] }
}
  ? Key
  : never

export type ContractOptions<
  BasePath extends string = string,
  Routes extends ContractRoutes = ContractRoutes,
  Errors extends ErrorStatusMap = ErrorStatusMap,
> = {
  readonly basePath?: BasePath
  readonly routes: Routes
  readonly errors?: Errors
}
