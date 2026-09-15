import type {
  APIMeta,
  APIPluginList,
  APIPluginRegistry,
  APIPluginRuntimeSettings,
  APISettings,
  PluginId,
  ResolvedAPIPluginRuntimeSettings,
  ResolvedAPIPluginSettingsById,
} from '../types.public'

export const procedurePluginIdsKey = Symbol('hulla.procedurePluginIds')

const reservedExtensionNames = ['$meta', '$key'] as const

type ProcedurePluginCarrier = {
  [procedurePluginIdsKey]?: readonly string[]
}

const defaultPluginSettings: ResolvedAPIPluginRuntimeSettings = {
  inject: 'always',
  aliases: {
    router: {},
    procedure: {},
  },
}

const unsafeExtensionNames = new Set(['__proto__', 'prototype', 'constructor'])

function assertSafeExtensionName(value: string, description: string): void {
  if (unsafeExtensionNames.has(value)) {
    throw new Error(`${description} cannot use unsafe key "${value}"`)
  }
}

function validateAliases(aliases: Record<string, string> | undefined, owner: string): void {
  for (const [source, target] of Object.entries(aliases ?? {})) {
    assertSafeExtensionName(source, `${owner} alias`)
    assertSafeExtensionName(target, `${owner} alias`)
  }
}

function createRegistry<P extends APIPluginList>(plugins: P): APIPluginRegistry<P> {
  const registry = Object.create(null) as APIPluginRegistry<P>

  for (const plugin of plugins) {
    assertSafeExtensionName(plugin.id, 'Plugin id')
    if (plugin.namespace !== undefined) assertSafeExtensionName(plugin.namespace, `Plugin "${plugin.id}" namespace`)
    const namespaceName = plugin.namespace ?? plugin.id
    if (namespaceName.startsWith('$')) {
      throw new Error(`Plugin "${plugin.id}" namespace must omit the framework-owned "$" prefix`)
    }
    const namespace = `$${namespaceName}`
    if ((reservedExtensionNames as readonly string[]).includes(namespace)) {
      throw new Error(`Plugin "${plugin.id}" namespace "${namespace}" is reserved by @hulla/api`)
    }
    if (Object.prototype.hasOwnProperty.call(registry, plugin.id)) {
      throw new Error(`Duplicate plugin id "${plugin.id}"`)
    }

    Object.defineProperty(registry, plugin.id, {
      configurable: true,
      enumerable: true,
      value: plugin,
      writable: true,
    })
  }

  return registry
}

function normalizePluginSettings<P extends APIPluginList, S extends APISettings>(
  plugins: P,
  settings: S['plugins']
): ResolvedAPIPluginSettingsById<P> {
  const normalized = Object.create(null) as ResolvedAPIPluginSettingsById<P>

  for (const plugin of plugins) {
    const configured =
      settings !== undefined && Object.prototype.hasOwnProperty.call(settings, plugin.id)
        ? (settings[plugin.id as keyof NonNullable<S['plugins']>] as APIPluginRuntimeSettings | undefined)
        : undefined
    validateAliases(configured?.aliases?.router, `Plugin "${plugin.id}" router`)
    validateAliases(configured?.aliases?.procedure, `Plugin "${plugin.id}" procedure`)
    validateAliases(plugin.defaults?.aliases?.router, `Plugin "${plugin.id}" default router`)
    validateAliases(plugin.defaults?.aliases?.procedure, `Plugin "${plugin.id}" default procedure`)
    Object.defineProperty(normalized, plugin.id, {
      configurable: true,
      enumerable: true,
      value: {
        inject: configured?.inject ?? plugin.defaults?.inject ?? defaultPluginSettings.inject,
        aliases: {
          router:
            configured?.aliases?.router ?? plugin.defaults?.aliases?.router ?? defaultPluginSettings.aliases.router,
          procedure:
            configured?.aliases?.procedure ??
            plugin.defaults?.aliases?.procedure ??
            defaultPluginSettings.aliases.procedure,
        },
      },
      writable: true,
    })
  }

  return normalized
}

function getAutoPluginIds<P extends APIPluginList>(
  plugins: P,
  settings: ResolvedAPIPluginSettingsById<P>
): readonly PluginId<P>[] {
  return plugins
    .filter((plugin) => settings[plugin.id as keyof typeof settings].inject === 'always')
    .map((plugin) => plugin.id) as unknown as readonly PluginId<P>[]
}

export function createPluginMeta<P extends APIPluginList, S extends APISettings>(
  plugins: P | undefined,
  settings: S['plugins']
): APIMeta<{}, S, P>['plugins'] {
  const list = (plugins ?? []) as P
  const registry = createRegistry(list)
  const resolvedSettings = normalizePluginSettings(list, settings)

  return {
    list,
    registry,
    settings: resolvedSettings,
    auto: getAutoPluginIds(list, resolvedSettings),
  }
}

export function mergeSelections<T extends string>(
  inherited: readonly T[] | undefined,
  local: readonly T[] | undefined
): readonly T[] | undefined {
  if (inherited === undefined) {
    return local
  }

  if (local === undefined) {
    return inherited
  }

  const selected = [...inherited]
  for (const key of local) {
    if (!selected.includes(key)) {
      selected.push(key)
    }
  }

  return selected
}

function injectMembers(
  target: Record<string, unknown>,
  members: Record<string, unknown>,
  aliases: Record<string, string>,
  reserved: readonly string[],
  owner: string
) {
  for (const [key, value] of Object.entries(members)) {
    const aliasedKey = Object.prototype.hasOwnProperty.call(aliases, key) ? aliases[key]! : key

    assertSafeExtensionName(key, `${owner} member`)
    assertSafeExtensionName(aliasedKey, `${owner} member`)

    if (reserved.includes(aliasedKey)) {
      throw new Error(`${owner} cannot expose reserved key "${aliasedKey}"`)
    }

    if (Object.prototype.hasOwnProperty.call(target, aliasedKey)) {
      throw new Error(`${owner} collides on key "${aliasedKey}"`)
    }

    Object.defineProperty(target, aliasedKey, {
      configurable: true,
      enumerable: true,
      value,
      writable: true,
    })
  }
}

function namespaceTarget(target: Record<string, unknown>, namespace: string, owner: string): Record<string, unknown> {
  assertSafeExtensionName(namespace, `${owner} namespace`)
  if (Object.prototype.hasOwnProperty.call(target, namespace)) {
    const existing = target[namespace]
    if (typeof existing !== 'object' || existing === null || Array.isArray(existing)) {
      throw new Error(`${owner} collides on namespace "${namespace}"`)
    }
    return existing as Record<string, unknown>
  }

  const namespaceMembers = Object.create(null) as Record<string, unknown>
  Object.defineProperty(target, namespace, {
    configurable: true,
    enumerable: true,
    value: namespaceMembers,
    writable: true,
  })
  return namespaceMembers
}

export function resolveRouterPluginMembers<
  M,
  S extends APISettings,
  P extends APIPluginList,
  Extensions extends Record<string, unknown>,
>(
  meta: APIMeta<M & {}, S, P>,
  activePluginIds: readonly string[] | undefined,
  buildMembers: (plugin: P[number], pluginSettings: ResolvedAPIPluginRuntimeSettings) => Extensions | undefined,
  _reserved: readonly string[]
): Extensions {
  const extensions = Object.create(null) as Extensions

  for (const pluginId of activePluginIds ?? []) {
    const plugin = meta.plugins.registry[pluginId as keyof typeof meta.plugins.registry]
    if (plugin === undefined) {
      continue
    }

    const pluginSettings = meta.plugins.settings[pluginId as keyof typeof meta.plugins.settings]
    const members = buildMembers(plugin, pluginSettings)
    if (members === undefined) {
      continue
    }

    const namespace = `$${plugin.namespace ?? plugin.id}`
    if ((reservedExtensionNames as readonly string[]).includes(namespace)) {
      throw new Error(`Router plugin "${pluginId}" cannot use reserved namespace "${namespace}"`)
    }
    const target = namespaceTarget(extensions as Record<string, unknown>, namespace, `Router plugin "${pluginId}"`)
    injectMembers(target, members, pluginSettings.aliases.router, [], `Router plugin "${pluginId}"`)
  }

  return extensions
}

export function attachProcedurePluginMembers<
  M,
  S extends APISettings,
  P extends APIPluginList,
  Handler extends object,
  Extensions extends Record<string, unknown>,
>(
  meta: APIMeta<M & {}, S, P>,
  handler: Handler,
  buildMembers: (plugin: P[number], pluginSettings: ResolvedAPIPluginRuntimeSettings) => Extensions | undefined,
  reserved: readonly string[]
) {
  const activePluginIds = (handler as ProcedurePluginCarrier)[procedurePluginIdsKey]

  for (const pluginId of activePluginIds ?? []) {
    const plugin = meta.plugins.registry[pluginId as keyof typeof meta.plugins.registry]
    if (plugin === undefined) {
      continue
    }

    const pluginSettings = meta.plugins.settings[pluginId as keyof typeof meta.plugins.settings]
    const members = buildMembers(plugin, pluginSettings)
    if (members === undefined) {
      continue
    }

    const namespace = `$${plugin.namespace ?? plugin.id}`
    if (reserved.includes(namespace)) {
      throw new Error(`Procedure plugin "${pluginId}" cannot use reserved namespace "${namespace}"`)
    }
    const target = namespaceTarget(
      handler as unknown as Record<string, unknown>,
      namespace,
      `Procedure plugin "${pluginId}"`
    )
    injectMembers(target, members, pluginSettings.aliases.procedure, [], `Procedure plugin "${pluginId}"`)
  }
}
