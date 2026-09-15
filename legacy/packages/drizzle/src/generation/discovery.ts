import { readdir, stat } from 'node:fs/promises'
import { dirname, extname, isAbsolute, join, resolve, sep } from 'node:path'

export async function resolveSchemaFiles(base: string, patterns: readonly string[]): Promise<string[]> {
  const result = new Set<string>()
  for (const pattern of patterns) {
    const absolute = isAbsolute(pattern) ? pattern : resolve(base, pattern)
    if (!hasGlob(absolute)) {
      const info = await stat(absolute)
      if (info.isDirectory()) {
        for (const file of await walk(absolute)) result.add(file)
      } else if (isModuleFile(absolute)) result.add(absolute)
      continue
    }
    const root = globRoot(absolute)
    const regex = globRegex(absolute)
    for (const file of await walk(root)) if (regex.test(file)) result.add(file)
  }
  return [...result].sort()
}

export function hasApiSegment(path: string): boolean {
  return path.split(/[\\/]/).includes('api')
}

async function walk(directory: string): Promise<string[]> {
  const result: string[] = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
    const path = join(directory, entry.name)
    if (entry.isDirectory()) result.push(...(await walk(path)))
    else if (entry.isFile() && isModuleFile(path) && !path.endsWith('.d.ts')) result.push(path)
  }
  return result
}

function globRegex(pattern: string): RegExp {
  let source = pattern.replace(/[.+^$()|[\]\\]/g, '\\$&')
  source = source.replace(/\{([^}]+)\}/g, (_, values: string) => `(${values.split(',').join('|')})`)
  source = source
    .replace(/\*\*/g, '\u0000')
    .replace(/\*/g, `[^${escapeRegex(sep)}]*`)
    .split('\u0000')
    .join('.*')
  return new RegExp(`^${source}$`)
}

function globRoot(pattern: string): string {
  const index = pattern.search(/[*{]/)
  return dirname(pattern.slice(0, index))
}

function hasGlob(value: string): boolean {
  return /[*{]/.test(value)
}

function isModuleFile(path: string): boolean {
  return ['.ts', '.mts', '.cts', '.js', '.mjs', '.cjs'].includes(extname(path))
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
