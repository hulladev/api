import { serializeGenerationOptions, type APIPlugin } from '@hulla/api'

type ResolvedPlugin = {
  readonly from: string
  readonly name: string
  readonly as: string
  readonly expression: string
}

export function pluginImportLines(plugins: readonly APIPlugin[] | undefined): string[] {
  return (plugins ?? []).map((value, index) => {
    const plugin = resolvePlugin(value, index)
    return `import { ${plugin.name} as ${plugin.as} } from ${JSON.stringify(plugin.from)}`
  })
}

export function createApiExpression(plugins: readonly APIPlugin[] | undefined): string {
  const expressions = (plugins ?? []).map((plugin, index) => resolvePlugin(plugin, index).expression)
  return expressions.length === 0 ? 'createApi()' : `createApi({ plugins: [${expressions.join(', ')}] })`
}

function resolvePlugin(plugin: APIPlugin, index: number): ResolvedPlugin {
  const generation = plugin.generation
  if (!generation) throw new Error(`Plugin "${plugin.id}" cannot be generated because it has no source metadata.`)
  const as = `hullaPlugin${index + 1}`
  let options = ''
  try {
    if (generation.options !== undefined) options = serializeGenerationOptions(generation.options)
  } catch {
    throw new Error(`Plugin configuration for "${plugin.id}" is not serializable.`)
  }
  return {
    from: generation.from,
    name: generation.name,
    as,
    expression: `${as}(${options})`,
  }
}
