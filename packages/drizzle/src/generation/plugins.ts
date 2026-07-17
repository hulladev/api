import { serializeGenerationOptions, type APIPlugin } from '@hulla/api'

export type ResolvedPlugin = {
  readonly id: string
  readonly from: string
  readonly name: string
  readonly options?: unknown
  readonly importLine: string
  readonly expression: string
}

const reservedNames = new Set(['meta', 'key'])

export function resolvePlugins(plugins: readonly APIPlugin[]): ResolvedPlugin[] {
  const names = new Set<string>()
  return plugins.map((plugin, index) => {
    const generation = plugin.generation
    if (!generation) {
      throw new Error(`Plugin "${plugin.id}" cannot be generated because it has no source metadata.`)
    }
    const namespace = plugin.namespace ?? plugin.id
    if (names.has(plugin.id)) throw new Error(`Duplicate plugin identity "${plugin.id}".`)
    if (namespace.startsWith('$')) throw new Error(`Plugin namespace "${namespace}" must omit the "$" prefix.`)
    if (reservedNames.has(namespace)) throw new Error(`Plugin namespace "${namespace}" is reserved.`)
    names.add(plugin.id)
    let options = ''
    try {
      if (generation.options !== undefined) options = serializeGenerationOptions(generation.options)
    } catch {
      throw new Error(`Plugin configuration for "${generation.name}" is not serializable.`)
    }
    const localName = `pluginFactory${index + 1}`
    return {
      id: plugin.id,
      from: generation.from,
      name: generation.name,
      options: generation.options,
      importLine: `import { ${generation.name} as ${localName} } from ${JSON.stringify(generation.from)}`,
      expression: `${localName}(${options})`,
    }
  })
}

export function pluginImports(plugins: readonly ResolvedPlugin[]): string[] {
  return plugins.map((plugin) => plugin.importLine)
}
