import { lstat, mkdir, symlink, unlink } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')

await link('node_modules/@hulla/api', '../../packages/core')

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
    if ((error as { code?: string }).code !== 'ENOENT') throw error
  }

  await symlink(sourcePath, targetPath)
}
