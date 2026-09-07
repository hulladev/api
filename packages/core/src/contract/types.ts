import type { ErrorStatusMap, NormalizedErrorStatusMap } from '../declared-errors'
import type { Route } from './route'
import type { AnyRouter, RouterRoutes } from './router'

declare const contractNodeType: unique symbol

export type ContractRoute = Route | AnyRouter

export type ContractRoutes = Readonly<Record<string, ContractRoute>>

export type ContractNodeIdentity<Key extends readonly string[]> = {
  readonly [contractNodeType]?: Key
}

type MountedRouter<Definition extends AnyRouter, Key extends readonly string[]> = Definition &
  ContractNodeIdentity<Key> & {
    readonly [Child in keyof RouterRoutes<Definition>]: Child extends keyof Definition
      ? MountedContractRoute<Extract<Definition[Child], ContractRoute>, readonly [...Key, Child & string]>
      : never
  }

type MountedContractRoute<Definition extends ContractRoute, Key extends readonly string[]> = Definition extends Route
  ? Definition & ContractNodeIdentity<Key>
  : Definition extends AnyRouter
    ? MountedRouter<Definition, Key>
    : never

export type MountedContractRoutes<Routes extends ContractRoutes> = {
  readonly [Key in keyof Routes]: MountedContractRoute<Routes[Key], readonly [Key & string]>
}

type ContractRoutesFor<Routes extends ContractRoutes> = string extends keyof Routes
  ? Readonly<Routes>
  : Readonly<MountedContractRoutes<Routes>>

export type Contract<
  BasePath extends string = string,
  Routes extends ContractRoutes = ContractRoutes,
  Errors extends NormalizedErrorStatusMap = NormalizedErrorStatusMap,
> = {
  readonly basePath: BasePath
  readonly routes: ContractRoutesFor<Routes>
  readonly errors: Readonly<Errors>
} & ContractNodeIdentity<readonly []>

type NestedContractNode<Definition> = Definition extends AnyRouter
  ?
      | Definition
      | {
          [Key in Exclude<keyof Definition, '$meta' | typeof contractNodeType>]: NestedContractNode<Definition[Key]>
        }[Exclude<keyof Definition, '$meta' | typeof contractNodeType>]
  : Definition

export type ContractNodeFor<ContractType extends Contract> =
  | ContractType
  | {
      [Key in keyof ContractType['routes']]: NestedContractNode<ContractType['routes'][Key]>
    }[keyof ContractType['routes']]

export type ContractNodeKey<Node> = Node extends {
  readonly [contractNodeType]?: infer Key extends readonly string[]
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
