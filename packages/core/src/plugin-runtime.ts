import { isRecord } from './object'
import type { APIClientPlugin, APIPlugin, APIProcedurePlugin, APIServerPlugin } from './plugin'

const unsafeNames = new Set(['__proto__', 'prototype', 'constructor'])

function assertSafeName(value: string, description: string): void {
  if (value.length === 0) throw new TypeError(`${description} must not be empty`)
  if (unsafeNames.has(value)) throw new TypeError(`${description} cannot use unsafe key "${value}"`)
}

type APIPluginCapability = 'client' | 'server' | 'procedures'

function capabilityLabel(capability: APIPluginCapability): string {
  return capability === 'procedures' ? 'Procedure' : capability === 'client' ? 'Client' : 'Server'
}

export function normalizeAPIPlugins(
  plugins: readonly APIClientPlugin[] | undefined,
  capability: 'client'
): readonly APIClientPlugin[]
export function normalizeAPIPlugins(
  plugins: readonly APIServerPlugin[] | undefined,
  capability: 'server'
): readonly APIServerPlugin[]
export function normalizeAPIPlugins(
  plugins: readonly APIProcedurePlugin[] | undefined,
  capability: 'procedures'
): readonly APIProcedurePlugin[]
export function normalizeAPIPlugins(
  plugins: readonly APIPlugin[] | undefined,
  capability: APIPluginCapability
): readonly APIPlugin[] {
  if (plugins === undefined) return Object.freeze([])
  if (!Array.isArray(plugins)) {
    throw new TypeError(`${capabilityLabel(capability)} plugins must be an array`)
  }

  const ids = new Set<string>()
  const normalized = [...plugins]

  for (const plugin of normalized) {
    if (!isRecord(plugin) || typeof plugin['id'] !== 'string') {
      throw new TypeError('API plugins must be created from plugin objects with a string id')
    }
    for (const section of ['client', 'server', 'procedures'] as const) {
      if (plugin[section] !== undefined && !isRecord(plugin[section])) {
        throw new TypeError(`Plugin "${plugin['id']}" ${section} hooks must be an object`)
      }
    }

    assertSafeName(plugin['id'], 'Plugin id')
    if (plugin['client'] === undefined && plugin['server'] === undefined && plugin['procedures'] === undefined) {
      throw new TypeError(`Plugin "${plugin['id']}" must provide client, server, or procedures hooks`)
    }
    if (plugin[capability] === undefined) {
      throw new TypeError(
        `Plugin "${plugin['id']}" does not provide ${capability} hooks and cannot be used by a ${capabilityLabel(capability).toLowerCase()} definition`
      )
    }
    if (ids.has(plugin['id'])) throw new TypeError(`Duplicate plugin id "${plugin['id']}"`)
    ids.add(plugin['id'])
  }

  return Object.freeze(normalized)
}
