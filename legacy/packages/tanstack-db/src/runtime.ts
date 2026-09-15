type CollectionInstance = {
  cleanup(): void
}

type CollectionFactories = Readonly<Record<string, () => CollectionInstance>>

export type CollectionRuntime<Factories extends CollectionFactories> = {
  readonly collections: {
    readonly [Key in keyof Factories]: ReturnType<Factories[Key]>
  }
  dispose(): void
}

/**
 * Owns a set of lazily-created collections for one application runtime.
 * Each factory is evaluated at most once and every created collection is
 * cleaned up when the runtime is disposed.
 */
export function createCollectionRuntime<const Factories extends CollectionFactories>(
  factories: Factories
): CollectionRuntime<Factories> {
  const instances = Object.create(null) as Partial<Record<keyof Factories, CollectionInstance>>
  const collections = {} as CollectionRuntime<Factories>['collections']
  let disposed = false

  for (const key of Object.keys(factories) as Array<keyof Factories>) {
    Object.defineProperty(collections, key, {
      enumerable: true,
      get() {
        if (disposed) throw new Error('Cannot access collections after their runtime has been disposed.')

        const existing = instances[key]
        if (existing !== undefined) return existing

        const created = factories[key]()
        instances[key] = created
        return created
      },
    })
  }

  return {
    collections,
    dispose() {
      if (disposed) return
      disposed = true

      for (const collection of Object.values(instances)) collection?.cleanup()
    },
  }
}
