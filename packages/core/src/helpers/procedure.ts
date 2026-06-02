import type {
  EffectiveUseBuilderArgs,
  BaseProcedureHandler,
  PluginBuilderArgs,
  ProcedureBuilderMeta,
  ProcedureState,
  ResolvedContext,
  UseBuilderArgs,
} from '../types.private'
import type { APIPluginList, APISettings, Middleware, Schema } from '../types.public'
import { isPromiseLike } from '../utils/async'

type KeyedMiddlewareList<M extends Middleware> = Keyof<M>[]

type Keyof<M extends Middleware> = UseBuilderArgs<M>[number]

export function mergeMiddlewareSelection<M extends Middleware>(
  inherited: UseBuilderArgs<M> | undefined,
  local: UseBuilderArgs<M> | undefined
): UseBuilderArgs<M> | undefined {
  if (inherited === undefined) {
    return local
  }

  if (local === undefined) {
    return inherited
  }

  const selected = [...inherited] as KeyedMiddlewareList<M>
  for (const key of local) {
    if (!selected.includes(key)) {
      selected.push(key)
    }
  }

  return selected
}

export function resolveContext<M extends Middleware, UA extends UseBuilderArgs<M>>(
  middleware: M,
  selected: UA
): ResolvedContext<M, UA> | Promise<ResolvedContext<M, UA>> {
  const entries: [UA[number], ReturnType<M[UA[number]]>][] = []
  let hasAsync = false

  for (const key of selected) {
    const value = middleware[key]() as ReturnType<M[UA[number]]>
    if (!hasAsync && isPromiseLike(value)) {
      hasAsync = true
    }
    entries.push([key, value])
  }

  if (hasAsync) {
    return Promise.all(entries.map(async ([key, value]) => [key, await value] as const)).then(
      (resolved) => Object.fromEntries(resolved) as ResolvedContext<M, UA>
    )
  }

  return Object.fromEntries(entries) as ResolvedContext<M, UA>
}

export function attachProcedureCoreMembers<
  M extends Middleware,
  IA extends UseBuilderArgs<M> | undefined,
  LA extends UseBuilderArgs<M> | undefined,
  SI extends Schema | undefined,
  SO extends Schema | undefined,
  RN extends string | undefined,
  R,
  S extends APISettings,
  N extends string | undefined = undefined,
>(handler: BaseProcedureHandler<M, IA, LA, SI, SO, RN, R, S, N>) {
  if (!('name' in handler.$meta)) {
    return
  }

  const namedHandler = handler as BaseProcedureHandler<M, IA, LA, SI, SO, RN, R, S, Extract<N, string>>
  const name = handler.$meta.name
  const root = ('router' in handler.$meta ? `${handler.$meta.router}/${name}` : name) as string

  namedHandler.key = {
    root: root as never,
    full: ((...args: unknown[]) => [root, ...args] as const) as never,
  }
}

export function createProcedureMeta<
  const M extends Middleware,
  IA extends UseBuilderArgs<M> | undefined,
  LA extends UseBuilderArgs<M> | undefined,
  SI extends Schema | undefined,
  SO extends Schema | undefined,
  RN extends string | undefined,
  P extends APIPluginList = [],
  IPA extends PluginBuilderArgs<P> | undefined = undefined,
  LPA extends PluginBuilderArgs<P> | undefined = undefined,
>(
  state: ProcedureState<M, IA, LA, SI, SO, RN, P, IPA, LPA>,
  selected: EffectiveUseBuilderArgs<M, IA, LA>
): ProcedureBuilderMeta<M, IA, LA, SI, SO, RN> {
  return {
    type: 'procedure',
    ...(state.router === undefined ? {} : { router: state.router }),
    middleware: {
      router: (state.inheritedUse ?? []) as ProcedureBuilderMeta<M, IA, LA, SI, SO, RN>['middleware']['router'],
      procedure: (state.use ?? []) as ProcedureBuilderMeta<M, IA, LA, SI, SO, RN>['middleware']['procedure'],
      selected: (selected ?? []) as ProcedureBuilderMeta<M, IA, LA, SI, SO, RN>['middleware']['selected'],
    },
    input: state.input,
    output: state.output,
  } as unknown as ProcedureBuilderMeta<M, IA, LA, SI, SO, RN>
}
