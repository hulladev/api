import { cp, mkdir, mkdtemp, readdir, realpath, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative, resolve, sep } from 'node:path'

// Keep installed third-party dependencies shared, but resolve every workspace link
// against the private copy so adapters cannot load a concurrently rebuilt core.
async function linkDependencies(source: string, target: string, root: string, snapshot: string): Promise<void> {
  let entries
  try {
    entries = await readdir(source, { withFileTypes: true })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
    throw error
  }
  await mkdir(target, { recursive: true })
  for (const entry of entries) {
    const from = join(source, entry.name)
    const to = join(target, entry.name)
    if (entry.name.startsWith('@')) {
      await linkDependencies(from, to, root, snapshot)
      continue
    }
    let resolved: string
    try {
      resolved = await realpath(from)
    } catch (error) {
      // Package managers can leave dangling links for removed workspace packages.
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue
      throw error
    }
    const local = resolved.startsWith(`${join(root, 'packages')}${sep}`)
    await symlink(local ? resolve(snapshot, relative(root, resolved)) : resolved, to)
  }
}

export async function createBenchmarkWorkspace(root: string): Promise<string> {
  root = await realpath(root)
  const snapshot = await mkdtemp(join(tmpdir(), 'hulla-bench-'))
  try {
    for (const name of ['packages', 'benchmarks', 'package.json', 'bun.lock']) {
      await cp(join(root, name), join(snapshot, name), {
        recursive: true,
        filter: (path) => {
          const parts = relative(root, path).split(sep)
          return !parts.some((part) => part === 'node_modules' || part === 'results' || part.startsWith('.'))
        },
      })
    }
    for (const directory of [
      '',
      'benchmarks',
      ...(await readdir(join(root, 'packages'))).map((name) => `packages/${name}`),
    ]) {
      await linkDependencies(
        join(root, directory, 'node_modules'),
        join(snapshot, directory, 'node_modules'),
        root,
        snapshot
      )
    }
    await mkdir(join(root, 'benchmarks/results'), { recursive: true })
    await symlink(join(root, 'benchmarks/results'), join(snapshot, 'benchmarks/results'))
    return snapshot
  } catch (error) {
    await rm(snapshot, { recursive: true, force: true })
    throw error
  }
}
