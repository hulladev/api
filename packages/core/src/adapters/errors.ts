import type { CanonicalContractPlan, CanonicalErrorDeclarationPlan } from '../contract/plan'
import { type AnyErrorDeclaration, type DeclaredError } from '../declared-errors'
import { isAPIError, toAPIProblem, type APIProblem } from '../errors'
import { ServerRuntimeError } from '../server/errors'
import { mapSchemaStep, type SchemaStep } from '../validation'
import type { AdapterPhase, AdapterResponse } from './types'

type DeclaredErrorSerializer = (error: DeclaredError<string, unknown>) => SchemaStep<AdapterResponse>

export type RuntimeErrors = {
  readonly factories: Readonly<Record<string, AnyErrorDeclaration>>
  readonly serializers: ReadonlyMap<AnyErrorDeclaration, DeclaredErrorSerializer>
}

function compileDeclaredErrorSerializer(status: number, plan: CanonicalErrorDeclarationPlan): DeclaredErrorSerializer {
  const data = plan.data
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
  if (data === undefined) return (error) => finalize(error)
  return (error) => {
    const encoded =
      data.encode === undefined ? mapSchemaStep(data.decode(error.data), () => error.data) : data.encode(error.data)
    return mapSchemaStep(encoded, (value) => finalize(error, value))
  }
}

export function compileRuntimeErrors(plan: CanonicalContractPlan): RuntimeErrors | undefined {
  if (plan.errors.length === 0) return undefined
  const serializers = new Map<AnyErrorDeclaration, DeclaredErrorSerializer>()
  for (const [status, declarations] of plan.errors) {
    for (const declaration of declarations) {
      serializers.set(declaration.declaration, compileDeclaredErrorSerializer(status, declaration))
    }
  }
  return { factories: plan.errorFactories, serializers }
}

export function serializeDeclaredError(
  errors: RuntimeErrors,
  error: DeclaredError<string, unknown>
): SchemaStep<AdapterResponse> {
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
