export const packages = ['core', 'integrations/query', 'integrations/swr']
export const rootDir = process.cwd()

export const BUNDLE = 'bun run bunchee -m --cwd'
export const BUILD = () => packages.map((pkg) => `${BUNDLE} ${pkg}`.split(' '))
