export type ServerAdapter<Id extends string = string, ContextInput extends object = object> = {
  readonly id: Id
  readonly kind: 'hulla.api.server-adapter'
  /** Type-only native values contributed to a server context factory. */
  readonly 'hulla.api.serverAdapterContext'?: ContextInput
}

export type ServerAdapterContextInput<Adapter extends ServerAdapter> =
  Adapter extends ServerAdapter<string, infer ContextInput> ? ContextInput : never

/** Creates an adapter descriptor. Adapter packages should reuse one descriptor singleton. */
export function createServerAdapter<const Id extends string>(id: Id): ServerAdapter<Id, object> {
  if (id.length === 0) throw new TypeError('Server adapter id must not be empty')
  return { id, kind: 'hulla.api.server-adapter' as const }
}

export function isServerAdapter(value: unknown): value is ServerAdapter {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { readonly kind?: unknown }).kind === 'hulla.api.server-adapter' &&
    typeof (value as { readonly id?: unknown }).id === 'string' &&
    (value as { readonly id: string }).id.length > 0
  )
}

/** Rejects an implementation bound to a different adapter. Called once when an adapter mounts it. */
export function assertServerAdapter(required: ServerAdapter | undefined, actual: ServerAdapter): void {
  if (required !== undefined && required.id !== actual.id) {
    throw new TypeError(`Server requires the ${required.id} adapter, but was mounted with ${actual.id}`)
  }
}
