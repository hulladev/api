import { readdir, readFile } from 'node:fs/promises'
import { extname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

const workspace = fileURLToPath(new URL('../../..', import.meta.url))
const ignoredDirectories = new Set(['.git', '.turbo', 'dist', 'node_modules'])

async function markdownFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = `${directory}/${entry.name}`
      if (entry.isDirectory()) return ignoredDirectories.has(entry.name) ? [] : markdownFiles(path)
      return entry.isFile() && extname(entry.name) === '.md' ? [path] : []
    })
  )
  return files.flat()
}

describe('documentation vocabulary', () => {
  test('uses scoped package names instead of a standalone product name', async () => {
    const violations: string[] = []

    for (const path of await markdownFiles(workspace)) {
      const lines = (await readFile(path, 'utf8')).split('\n')
      lines.forEach((line, index) => {
        if (/(?<!@)\bHulla(?:'s)?\b/.test(line)) {
          violations.push(`${relative(workspace, path)}:${index + 1}`)
        }
      })
    }

    expect(violations).toEqual([])
  })
})
