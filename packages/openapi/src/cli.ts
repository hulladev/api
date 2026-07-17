#!/usr/bin/env node
import { parseArguments } from './args'
import { generate } from './index'

async function main() {
  const { input, output, operationNames = 'operationId' } = parseArguments(process.argv.slice(2))

  if (input === undefined || output === undefined) {
    printUsage()
    process.exitCode = 1
    return
  }

  await generate({
    input,
    output,
    operationNames: operationNames,
  })
}

function printUsage() {
  console.error('Usage: hulla-api-openapi <openapi.json> --output <api.generated.ts> [--names operationId|path]')
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
