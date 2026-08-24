#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createJiti } from 'jiti'
import { createOpenAPIDocument } from './export'
import { generateContractFromOpenAPI } from './import'
import { readOpenAPIDocument, writeGeneratedOpenAPIContract, writeOpenAPIDocument } from './io'
import type { DefinedOpenAPI } from './sidecar'

type Arguments = {
  readonly command: string | undefined
  readonly input: string | undefined
  readonly options: Readonly<Record<string, string | true>>
}

function argumentsFor(values: readonly string[]): Arguments {
  const [command, input, ...rest] = values
  const options: Record<string, string | true> = {}
  for (let index = 0; index < rest.length; index += 1) {
    const value = rest[index]!
    if (!value.startsWith('--')) throw new Error(`Unexpected argument ${value}`)
    const name = value.slice(2)
    const next = rest[index + 1]
    if (next === undefined || next.startsWith('--')) options[name] = true
    else {
      options[name] = next
      index += 1
    }
  }
  return { command, input, options }
}

function option(arguments_: Arguments, name: string): string | undefined {
  const value = arguments_.options[name]
  return typeof value === 'string' ? value : undefined
}

function required(value: string | undefined, message: string): string {
  if (value === undefined) throw new Error(message)
  return value
}

function relativeModule(from: string, to: string): string {
  const path = relative(dirname(resolve(from)), resolve(to))
    .replace(/\\/g, '/')
    .replace(/\.ts$/, '')
  return path.startsWith('.') ? path : `./${path}`
}

async function importDefinition(path: string): Promise<DefinedOpenAPI> {
  const jiti = createJiti(import.meta.url, { interopDefault: false })
  const module = await jiti.import<{ readonly default?: unknown }>(pathToFileURL(resolve(path)).href)
  const value = module.default
  if (typeof value !== 'object' || value === null || !('kind' in value) || value.kind !== 'hulla-openapi') {
    throw new TypeError(`${path} must default-export defineOpenAPI(...)`)
  }
  return value as DefinedOpenAPI
}

async function sameFile(path: string, expected: string): Promise<boolean> {
  try {
    return (await readFile(path, 'utf8')) === expected
  } catch {
    return false
  }
}

function usage(): void {
  console.error(`Usage:
  hulla-openapi export <api.openapi.ts> --output <openapi.json|yaml>
  hulla-openapi import <openapi.json|yaml> --contract <api.generated.ts> --openapi <api.generated.openapi.ts>
  hulla-openapi check <openapi.json|yaml> --contract <api.generated.ts> --openapi <api.generated.openapi.ts>`)
}

async function main(): Promise<void> {
  const arguments_ = argumentsFor(process.argv.slice(2))
  const input = required(arguments_.input, 'An input path is required')

  if (arguments_.command === 'export') {
    const output = required(option(arguments_, 'output'), '--output is required')
    const definition = await importDefinition(input)
    await writeOpenAPIDocument(output, await createOpenAPIDocument(definition))
    return
  }

  if (arguments_.command === 'import' || arguments_.command === 'check') {
    const contract = required(option(arguments_, 'contract'), '--contract is required')
    const openapi = required(option(arguments_, 'openapi'), '--openapi is required')
    const generated = generateContractFromOpenAPI(await readOpenAPIDocument(input), {
      contractImport: relativeModule(openapi, contract),
    })
    if (arguments_.command === 'import') {
      await writeGeneratedOpenAPIContract(generated, { contract, openapi })
      return
    }
    const valid = (await sameFile(contract, generated.contractCode)) && (await sameFile(openapi, generated.openapiCode))
    if (!valid) throw new Error('Generated Hulla contract files are out of date; run hulla-openapi import')
    return
  }

  usage()
  process.exitCode = 1
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
