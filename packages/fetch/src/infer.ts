import type { Obj, ProcedureMeta } from '@hulla/api'
import type { Instance, Methods, RInit } from '@hulla/fetch'
import { resolve } from '@hulla/fetch'

export function hasInput<const I>(data: any): data is { input: I } {
  return 'input' in data && data.input !== undefined
}

export function infer<
  const CTX extends Obj,
  const N extends string,
  const M extends Methods | Lowercase<Methods>,
  const G extends string,
  const I extends RInit<string, Methods>,
  const D extends
    | { context: CTX; meta: ProcedureMeta<N, M, G> }
    | { context: CTX; meta: ProcedureMeta<N, M, G>; input: I },
  const IN extends Instance<any> | undefined = undefined,
>(data: D, instance?: IN): IN extends Instance<infer IC> ? ReturnType<Instance<IC>['resolve']> : Promise<Response> {
  if (hasInput<I>(data)) {
    const input = { ...data.input, method: data.input.method ?? data.meta.method }
    return (instance ? instance.resolve(input) : resolve(input)) as IN extends Instance<infer IC>
      ? ReturnType<Instance<IC>['resolve']>
      : Promise<Response>
  }
  return (
    instance
      ? instance.resolve({ url: data.meta.route, method: data.meta.method })
      : resolve({ url: data.meta.route, method: data.meta.method })
  ) as IN extends Instance<infer IC> ? ReturnType<Instance<IC>['resolve']> : Promise<Response>
}

export function addInfer<const IN extends Instance<any>>(instance: IN) {
  const instanceInfer = <
    const CTX extends Obj,
    const N extends string,
    const M extends Methods | Lowercase<Methods>,
    const G extends string,
    const I extends RInit<string, Methods>,
    const D extends
      | { context: CTX; meta: ProcedureMeta<N, M, G> }
      | { context: CTX; meta: ProcedureMeta<N, M, G>; input: I },
  >(
    data: D
  ) => infer<CTX, N, M, G, I, D, IN>(data, instance)
  return { ...instance, infer: instanceInfer } as IN & { infer: typeof instanceInfer }
}
