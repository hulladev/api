import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
const packagesRoot = path.join(root, 'packages')
const packageDirectories = await readdir(packagesRoot, { withFileTypes: true })
const versions = []

for (const directory of packageDirectories) {
  if (!directory.isDirectory()) continue
  const packagePath = path.join(packagesRoot, directory.name, 'package.json')
  const packageJson = JSON.parse(await readFile(packagePath, 'utf8'))
  if (!String(packageJson.name).startsWith('@hulla/api')) continue
  if (!/^2\.0\.0-beta\.\d+$/.test(packageJson.version)) {
    throw new Error(`Refusing non-beta API version ${packageJson.name}@${packageJson.version}`)
  }
  versions.push(`${packageJson.name}@${packageJson.version}`)
}

const prerelease = JSON.parse(await readFile(path.join(root, '.changeset/pre.json'), 'utf8'))
if (prerelease.mode !== 'pre' || prerelease.tag !== 'beta') {
  throw new Error('Changesets must remain in beta prerelease mode.')
}

console.log(`Release guard accepted ${versions.join(', ')} for npm tag beta.`)
