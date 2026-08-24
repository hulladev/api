export type CompositionScope = {
  readonly owner: object
  readonly parent?: CompositionScope
}

export type CompositionState<Binding, Scope extends CompositionScope = CompositionScope> = {
  readonly bindings: readonly Binding[]
  readonly scope: Scope
}

const compositionStates = new WeakMap<object, CompositionState<unknown>>()

export function registerComposition<Binding>(
  value: object,
  scope: CompositionScope,
  bindings: readonly Binding[]
): void {
  compositionStates.set(value, { bindings, scope })
}

export function getCompositionState<Binding, Scope extends CompositionScope = CompositionScope>(
  value: object
): CompositionState<Binding, Scope> | undefined {
  return compositionStates.get(value) as CompositionState<Binding, Scope> | undefined
}

export function isScopeDescendant(scope: CompositionScope, ancestor: CompositionScope): boolean {
  let current: CompositionScope | undefined = scope
  while (current !== undefined) {
    if (current === ancestor) return true
    current = current.parent
  }
  return false
}
