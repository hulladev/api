import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
async function files(directory: string): Promise<string[]> {
  const result: string[] = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) result.push(...(await files(`${directory}/${entry.name}`)))
    else if (entry.name.endsWith('.md')) result.push(`${directory}/${entry.name}`)
  }
  return result
}
const violations: string[] = []
for (const path of [`${root}/README.md`, ...(await files(`${root}/docs`))]) {
  ;(await readFile(path, 'utf8')).split('\n').forEach((line, index) => {
    if (/(?<!@)\bHulla(?:'s)?\b/.test(line)) violations.push(`${path}:${index + 1}: use the scoped package name`)
  })
}
if (violations.length > 0) throw new Error(violations.join('\n'))
console.log('Documentation vocabulary checked (README and docs).')
