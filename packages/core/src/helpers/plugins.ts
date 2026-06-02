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

function createRegistry<P extends APIPluginList>(plugins: P): APIPluginRegistry<P> {
  const registry = {} as APIPluginRegistry<P>

  for (const plugin of plugins) {
    if (plugin.id in registry) {
      throw new Error(`Duplicate plugin id "${plugin.id}"`)
    }

    registry[plugin.id as keyof typeof registry] = plugin as (typeof registry)[keyof typeof registry]
  }

  return registry
}

function normalizePluginSettings<P extends APIPluginList, S extends APISettings>(
  plugins: P,
  settings: S['plugins']
): ResolvedAPIPluginSettingsById<P> {
  const normalized = {} as ResolvedAPIPluginSettingsById<P>

  for (const plugin of plugins) {
    const configured = settings?.[plugin.id as keyof NonNullable<S['plugins']>] as APIPluginRuntimeSettings | undefined
    normalized[plugin.id as keyof typeof normalized] = {
      inject: configured?.inject ?? defaultPluginSettings.inject,
      aliases: {
        router: configured?.aliases?.router ?? defaultPluginSettings.aliases.router,
        procedure: configured?.aliases?.procedure ?? defaultPluginSettings.aliases.procedure,
      },
    } as (typeof normalized)[keyof typeof normalized]
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
    const aliasedKey = aliases[key] ?? key

    if (reserved.includes(aliasedKey)) {
      throw new Error(`${owner} cannot expose reserved key "${aliasedKey}"`)
    }

    if (Object.prototype.hasOwnProperty.call(target, aliasedKey)) {
      throw new Error(`${owner} collides on key "${aliasedKey}"`)
    }

    target[aliasedKey] = value
  }
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
  reserved: readonly string[]
): Extensions {
  const extensions = {} as Extensions

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

    injectMembers(extensions, members, pluginSettings.aliases.router, reserved, `Router plugin "${pluginId}"`)
  }

  return extensions
}

export function attachProcedurePluginMembers<
  M,
  S extends APISettings,
  P extends APIPluginList,
  Handler extends Record<string, unknown>,
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

    injectMembers(handler, members, pluginSettings.aliases.procedure, reserved, `Procedure plugin "${pluginId}"`)
  }
}
