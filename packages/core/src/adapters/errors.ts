import type { Contract } from '../contract'
import { errorFactories, type AnyErrorDeclaration, type DeclaredError } from '../declared-errors'
import { isAPIError, toAPIProblem, type APIProblem } from '../errors'
import type { ExecutionStep } from '../execution'
import { ServerRuntimeError } from '../server/errors'
import { compileSchemaExecution } from '../validation'
import type { AdapterPhase, AdapterResponse } from './types'

type DeclaredErrorSerializer = (error: DeclaredError<string, unknown>) => ExecutionStep<AdapterResponse>

export type RuntimeErrors = {
  readonly factories: Readonly<Record<string, AnyErrorDeclaration>>
  readonly serializers: ReadonlyMap<AnyErrorDeclaration, DeclaredErrorSerializer>
}

function compileDeclaredErrorSerializer(status: number, declaration: AnyErrorDeclaration): DeclaredErrorSerializer {
  const data =
    declaration.data === undefined ? undefined : compileSchemaExecution(declaration.data, { location: 'response' })
  const finalize = (error: DeclaredError<string, unknown>, encodedData?: unknown): AdapterResponse => ({
    status,
    headers: { 'content-type': 'application/json' },
    body: {
      kind: 'json',
      value: {
        code: error.code,
        message: error.message,
        ...(data === undefined ? {} : { data: encodedData }),
      },
    },
  })
  return async (error) => {
    let value = error.data
    if (data !== undefined) {
      value = await (data.encode ?? data.decode)(value)
    }
    return finalize(error, value)
  }
}

export function compileRuntimeErrors(contract: Contract): RuntimeErrors | undefined {
  if (Object.keys(contract.errors).length === 0) return undefined
  const serializers = new Map<AnyErrorDeclaration, DeclaredErrorSerializer>()
  for (const [status, declarations] of Object.entries(contract.errors)) {
    for (const declaration of declarations) {
      serializers.set(declaration, compileDeclaredErrorSerializer(Number(status), declaration))
    }
  }
  return { factories: errorFactories(contract.errors), serializers }
}

export function serializeDeclaredError(
  errors: RuntimeErrors,
  error: DeclaredError<string, unknown>
): ExecutionStep<AdapterResponse> {
  const serialize = errors.serializers.get(error.declaration)
  if (serialize === undefined) {
    throw new ServerRuntimeError('invalid-server-response', 500, `Undeclared error ${error.code}`)
  }
  return serialize(error)
}

function problemResponse(problem: APIProblem, headers: Readonly<Record<string, string>> = {}): AdapterResponse {
  return {
    status: problem.status,
    headers: { ...headers, 'content-type': 'application/problem+json; charset=utf-8' },
    body: { kind: 'json' as const, value: problem },
  }
}

export function simpleProblem(
  status: number,
  code: string,
  title: string,
  headers?: Readonly<Record<string, string>>
): AdapterResponse {
  return problemResponse({ type: 'about:blank', title, status, code }, headers)
}

export function errorResponse(error: unknown, phase: AdapterPhase): AdapterResponse {
  if (phase === 'request' || phase === 'routing') {
    if (error instanceof ServerRuntimeError) {
      return problemResponse(toAPIProblem(error, { status: error.status, title: error.message }))
    }
    if (isAPIError(error)) return problemResponse(toAPIProblem(error, { status: 400, title: 'Invalid request' }))
  }

  return simpleProblem(500, 'internal-server-error', 'Internal server error')
}
