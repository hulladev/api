import { mkdir, readFile, rename, rm, rmdir, stat, writeFile } from 'node:fs/promises'
import { dirname, extname, isAbsolute, join, relative, resolve } from 'node:path'

const manifestName = '.hulla-api-openapi-manifest.json'

export type OpenAPIOutputFile = {
  readonly path: string
  readonly code: string
}

export async function writeOpenAPIOutput(
  output: string,
  code: string,
  files: readonly OpenAPIOutputFile[]
): Promise<void> {
  if ((await outputKind(output)) === 'file') {
    await writeFile(output, code)
    return
  }

  await mkdir(output, { recursive: true })
  const previousFiles = await readManifest(output)
  const nextFiles = new Set(files.map((file) => normalizePath(file.path)))

  for (const file of files) {
    const filePath = safePath(output, file.path)
    await mkdir(dirname(filePath), { recursive: true })
    await writeFile(filePath, file.code)
  }

  for (const file of previousFiles) {
    if (nextFiles.has(file)) continue
    const filePath = safePath(output, file)
    await rm(filePath, { force: true })
    await removeEmptyDirectories(dirname(filePath), resolve(output))
  }

  const manifestPath = join(output, manifestName)
  const temporaryManifest = `${manifestPath}.${process.pid}-${Date.now()}.tmp`
  await writeFile(temporaryManifest, `${JSON.stringify({ version: 1, files: [...nextFiles].sort() }, null, 2)}\n`)
  await rename(temporaryManifest, manifestPath)
}

async function readManifest(output: string): Promise<string[]> {
  try {
    const value = JSON.parse(await readFile(join(output, manifestName), 'utf8')) as {
      version?: unknown
      files?: unknown
    }
    if (value.version !== 1 || !Array.isArray(value.files) || !value.files.every((file) => typeof file === 'string')) {
      throw new Error(`Invalid OpenAPI output manifest in ${output}.`)
    }
    for (const file of value.files) safePath(output, file)
    return value.files
  } catch (error) {
    if (isErrorCode(error, 'ENOENT')) return []
    throw error
  }
}

function safePath(output: string, path: string): string {
  const root = resolve(output)
  const target = resolve(root, path)
  const fromRoot = relative(root, target)
  if (
    path.length === 0 ||
    isAbsolute(path) ||
    fromRoot === '..' ||
    fromRoot.startsWith('../') ||
    fromRoot.startsWith('..\\')
  ) {
    throw new Error(`Unsafe OpenAPI output path "${path}".`)
  }
  return target
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/')
}

async function removeEmptyDirectories(directory: string, root: string): Promise<void> {
  let current = directory
  while (current !== root) {
    try {
      await rmdir(current)
    } catch (error) {
      if (isErrorCode(error, 'ENOENT')) return
      if (isErrorCode(error, 'ENOTEMPTY') || isErrorCode(error, 'EEXIST')) return
      throw error
    }
    current = dirname(current)
  }
}

async function outputKind(output: string): Promise<'file' | 'directory'> {
  try {
    return (await stat(output)).isDirectory() ? 'directory' : 'file'
  } catch (error) {
    if (isErrorCode(error, 'ENOENT')) return looksLikeDirectory(output) ? 'directory' : 'file'
    throw error
  }
}

function looksLikeDirectory(output: string): boolean {
  return /[\\/]$/.test(output) || extname(output) === ''
}

function isErrorCode(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code
}
