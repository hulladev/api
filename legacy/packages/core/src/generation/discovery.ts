import { access, readFile, readdir } from 'node:fs/promises'
import { dirname, extname, join, resolve } from 'node:path'

export async function collectLocalDependencies(entries: readonly string[]): Promise<string[]> {
  const found = new Set<string>()
  const pending = [...entries]
  const importPattern = /(?:import|export)\s+(?:[^'";]+?\s+from\s+)?["'](\.[^"']+)["']/g

  while (pending.length > 0) {
    const file = pending.pop()!
    if (found.has(file)) continue
    found.add(file)
    const source = await readFile(file, 'utf8')
    for (const match of source.matchAll(importPattern)) {
      const dependency = await resolveLocalImport(dirname(file), match[1]!)
      if (dependency && !found.has(dependency)) pending.push(dependency)
    }
  }

  return [...found].sort()
}

async function resolveLocalImport(directory: string, specifier: string): Promise<string | undefined> {
  const target = resolve(directory, specifier)
  const candidates = extname(target)
    ? [target]
    : [
        ...['.ts', '.mts', '.cts', '.tsx', '.js', '.mjs', '.cjs', '.jsx', '.json'].map(
          (extension) => `${target}${extension}`
        ),
        ...['.ts', '.mts', '.cts', '.tsx', '.js', '.mjs', '.cjs', '.jsx'].map((extension) =>
          join(target, `index${extension}`)
        ),
      ]
  for (const candidate of candidates) {
    try {
      await access(candidate)
      return candidate
    } catch {}
  }
  return undefined
}

export async function walkRouterFiles(root: string): Promise<string[]> {
  let entries
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch (error) {
    if ((error as { code?: string }).code === 'ENOENT') return []
    throw error
  }
  const files: string[] = []
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.hulla' || entry.name.startsWith('.')) continue
    const path = join(root, entry.name)
    if (entry.isDirectory()) files.push(...(await walkRouterFiles(path)))
    else if (entry.isFile() && /\.router\.(?:[cm]?[jt]s)$/.test(entry.name)) files.push(path)
  }
  return files.sort()
}
