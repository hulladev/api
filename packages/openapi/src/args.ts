import type { OperationNameMode } from './index'

export type CLIArguments = {
  readonly input?: string
  readonly output?: string
  readonly operationNames?: OperationNameMode
}

export function parseArguments(argv: readonly string[]): CLIArguments {
  let input: string | undefined
  let output: string | undefined
  let operationNames: OperationNameMode | undefined

  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index]!
    const [name, inlineValue] = argument.split('=', 2)

    if (name === '-o' || name === '--output') {
      output = optionValue(name, inlineValue ?? argv[++index])
      continue
    }
    if (name === '--names') {
      const value = optionValue(name, inlineValue ?? argv[++index])
      if (value !== 'operationId' && value !== 'path') {
        throw new Error('--names must be "operationId" or "path".')
      }
      operationNames = value
      continue
    }
    if (argument.startsWith('-')) throw new Error(`Unknown option "${argument}".`)
    if (input !== undefined) throw new Error('Only one OpenAPI input may be provided.')
    input = argument
  }

  return { input, output, operationNames }
}

function optionValue(name: string, value: string | undefined): string {
  if (value === undefined || value.startsWith('-')) throw new Error(`${name} requires a value.`)
  return value
}
