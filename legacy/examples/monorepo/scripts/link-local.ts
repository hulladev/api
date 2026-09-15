import { lstat, mkdir, symlink, unlink } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')

await Promise.all([
  link('node_modules/@hulla/api', '../../packages/core'),
  link('node_modules/@hulla/api-drizzle', '../../packages/drizzle'),
  link('node_modules/@hulla/api-tanstack-db', '../../packages/tanstack-db'),
  link('node_modules/@hulla/api-tanstack-query', '../../packages/tanstack-query'),
  link('apps/backend/node_modules/@hulla/api', '../../packages/core'),
  link('apps/backend/node_modules/@hulla/api-drizzle', '../../packages/drizzle'),
  link('packages/api-client/node_modules/@hulla/api', '../../packages/core'),
  link('packages/api-client/node_modules/@hulla/api-tanstack-db', '../../packages/tanstack-db'),
  link('packages/api-client/node_modules/@hulla/api-tanstack-query', '../../packages/tanstack-query'),
])

async function link(target: string, source: string) {
  const targetPath = resolve(root, target)
  const sourcePath = resolve(root, source)

  await mkdir(dirname(targetPath), { recursive: true })

  try {
    const stats = await lstat(targetPath)

    if (stats.isSymbolicLink()) {
      await unlink(targetPath)
    } else {
      return
    }
  } catch (error) {
    if ((error as { code?: string }).code !== 'ENOENT') {
      throw error
    }
  }

  await symlink(sourcePath, targetPath)
}
