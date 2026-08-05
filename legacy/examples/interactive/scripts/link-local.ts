import { lstat, mkdir, symlink, unlink } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const packages = [
  ['@hulla/api', '../../packages/core'],
  ['@hulla/api-tanstack-db', '../../packages/tanstack-db'],
  ['@hulla/api-tanstack-query', '../../packages/tanstack-query'],
] as const

await Promise.all(
  ['', 'apps/backend/', 'apps/web/'].flatMap((prefix) =>
    packages.map(([name, source]) => link(`${prefix}node_modules/${name}`, source))
  )
)

async function link(target: string, source: string) {
  const targetPath = resolve(root, target)
  const sourcePath = resolve(root, source)

  await mkdir(dirname(targetPath), { recursive: true })

  try {
    const stats = await lstat(targetPath)
    if (stats.isSymbolicLink()) await unlink(targetPath)
    else return
  } catch (error) {
    if ((error as { code?: string }).code !== 'ENOENT') throw error
  }

  await symlink(sourcePath, targetPath)
}
