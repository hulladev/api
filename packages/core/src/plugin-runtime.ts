import { isRecord } from './object'
import type { APIPlugin, APIPluginRuntimeTarget } from './plugin'

const unsafeNames = new Set(['__proto__', 'prototype', 'constructor'])

function assertSafeName(value: string, description: string): void {
  if (value.length === 0) throw new TypeError(`${description} must not be empty`)
  if (unsafeNames.has(value)) throw new TypeError(`${description} cannot use unsafe key "${value}"`)
}

function supportsTarget(plugin: APIPlugin, target: APIPluginRuntimeTarget): boolean {
  return plugin.target === target || plugin.target === 'universal'
}

export function normalizeAPIPlugins(
  plugins: readonly APIPlugin[] | undefined,
  target: APIPluginRuntimeTarget
): readonly APIPlugin[] {
  if (plugins === undefined) return Object.freeze([])
  if (!Array.isArray(plugins)) {
    throw new TypeError(`${target === 'client' ? 'Client' : 'Server'} plugins must be an array`)
  }

  const ids = new Set<string>()
  const namespaces = new Set<string>()
  const normalized = [...plugins]

  for (const plugin of normalized) {
    if (!isRecord(plugin) || typeof plugin['id'] !== 'string') {
      throw new TypeError('API plugins must be created from plugin objects with a string id')
    }
    if (plugin['target'] !== 'client' && plugin['target'] !== 'server' && plugin['target'] !== 'universal') {
      throw new TypeError(`Plugin "${plugin['id']}" must target "client", "server", or "universal"`)
    }

    const typed = plugin as APIPlugin
    assertSafeName(typed.id, 'Plugin id')
    if (!supportsTarget(typed, target)) {
      throw new TypeError(`Plugin "${typed.id}" targets ${typed.target} and cannot be used by a ${target} definition`)
    }
    if (ids.has(typed.id)) throw new TypeError(`Duplicate plugin id "${typed.id}"`)
    ids.add(typed.id)

    const namespace = typed.namespace ?? typed.id
    assertSafeName(namespace, `Plugin "${typed.id}" namespace`)
    if (namespace.startsWith('$')) {
      throw new TypeError(`Plugin "${typed.id}" namespace must omit the framework-owned "$" prefix`)
    }
    if (namespace === 'key') throw new TypeError(`Plugin "${typed.id}" namespace "$key" is reserved by @hulla/api`)
    if (namespaces.has(namespace)) throw new TypeError(`Duplicate plugin namespace "$${namespace}"`)
    namespaces.add(namespace)
  }

  return Object.freeze(normalized)
}
