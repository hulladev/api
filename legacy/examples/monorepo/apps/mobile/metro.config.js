const path = require('node:path')
const { getDefaultConfig } = require('expo/metro-config')

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname)
const workspaceNodeModules = path.resolve(__dirname, '../../node_modules')
const dedupedTanStackPackages = new Set([
  '@tanstack/db',
  '@tanstack/query-core',
  '@tanstack/query-db-collection',
  '@tanstack/react-db',
  '@tanstack/react-query',
])

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === '@hulla/api') {
    return context.resolveRequest(context, '@hulla/api/runtime', platform)
  }

  if (dedupedTanStackPackages.has(moduleName)) {
    return context.resolveRequest(context, path.join(workspaceNodeModules, moduleName), platform)
  }

  return context.resolveRequest(context, moduleName, platform)
}

module.exports = config
