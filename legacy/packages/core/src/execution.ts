import type { ProcedureExecutionContext } from './types.public'

export const procedureExecuteKey = Symbol.for('hulla.api.procedure.execute')

type ProcedureExecutorOptions =
  | { readonly inputParsed?: false }
  | { readonly inputParsed: true; readonly parsedInput: unknown }

type ProcedureExecutor = (
  args: readonly unknown[],
  context: ProcedureExecutionContext,
  options?: ProcedureExecutorOptions
) => unknown

export class ProcedureInputError extends Error {
  readonly cause: unknown

  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : 'Invalid procedure input.')
    this.name = 'ProcedureInputError'
    this.cause = cause
  }
}

export type ExecutableProcedure = {
  [procedureExecuteKey]: ProcedureExecutor
}
