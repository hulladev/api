import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, extname } from 'node:path'
import YAML from 'yaml'
import type { GeneratedOpenAPIContract } from './import'
import type { OpenAPIDocument } from './types'

function isYAML(path: string): boolean {
  const extension = extname(path).toLowerCase()
  return extension === '.yaml' || extension === '.yml'
}

export async function readOpenAPIDocument(path: string): Promise<OpenAPIDocument> {
  const source = await readFile(path, 'utf8')
  const parsed: unknown = isYAML(path) ? YAML.parse(source) : JSON.parse(source)
  if (typeof parsed !== 'object' || parsed === null || !('paths' in parsed) || !('info' in parsed)) {
    throw new TypeError(`${path} is not an OpenAPI document`)
  }
  return parsed as OpenAPIDocument
}

export async function writeOpenAPIDocument(path: string, document: OpenAPIDocument): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const source = isYAML(path) ? YAML.stringify(document) : `${JSON.stringify(document, null, 2)}\n`
  await writeFile(path, source)
}

export async function writeGeneratedOpenAPIContract(
  generated: GeneratedOpenAPIContract,
  paths: { readonly contract: string; readonly openapi: string }
): Promise<void> {
  await Promise.all([
    mkdir(dirname(paths.contract), { recursive: true }),
    mkdir(dirname(paths.openapi), { recursive: true }),
  ])
  await Promise.all([
    writeFile(paths.contract, generated.contractCode),
    writeFile(paths.openapi, generated.openapiCode),
  ])
}
