#!/usr/bin/env node
import { cli } from './args'
import { generate } from './index'

async function main() {
  const args = cli.parse(process.argv.slice(2)).arguments
  const input = args.input.value
  const output = args.output.value
  const operationNames = args.names.value ?? 'operationId'

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
