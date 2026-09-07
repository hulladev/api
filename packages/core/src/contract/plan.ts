import type { CompiledContractRoute } from '../compiler'
import type { RouteMetadata } from '../context'
import { errorFactories, type AnyErrorDeclaration } from '../declared-errors'
import { type ExecutionStep } from '../execution'
import { compileSchemaExecution, type AnySchema } from '../validation'
import { mimeEssence, type AnyRequestBody } from './request'
import type { AnyRouteResponse } from './response'
import { compileContractRoutes, getContractState } from './state'
import type { Contract } from './types'

type RuntimeSchemaExecutionPlan = {
  readonly decode: (value: unknown) => ExecutionStep<unknown>
  readonly encode?: (value: unknown) => ExecutionStep<unknown>
}

export type CanonicalRequestBodyPlan = {
  readonly declaration: AnyRequestBody
  readonly expectedContentType: string
  readonly schema: RuntimeSchemaExecutionPlan
}

export type CanonicalResponsePlan = {
  readonly definition: AnyRouteResponse
  readonly expectedContentType?: string
  readonly headers?: RuntimeSchemaExecutionPlan
  readonly body?: RuntimeSchemaExecutionPlan
}

export type CanonicalResponseEntry = readonly [status: number, response: CanonicalResponsePlan]

export type CanonicalErrorDeclarationPlan = {
  readonly declaration: AnyErrorDeclaration
  readonly data?: RuntimeSchemaExecutionPlan
}

type CanonicalErrorEntry = readonly [status: number, errors: readonly CanonicalErrorDeclarationPlan[]]

export type CanonicalRoutePlan = {
  readonly compiled: CompiledContractRoute
  readonly metadata: RouteMetadata
  readonly hasInput: boolean
  readonly headers?: RuntimeSchemaExecutionPlan
  readonly body?: CanonicalRequestBodyPlan
  readonly responses: readonly CanonicalResponseEntry[]
}

export type CanonicalContractPlan<RoutePlan extends CanonicalRoutePlan = CanonicalRoutePlan> = {
  readonly routes: readonly RoutePlan[]
  readonly errors: readonly CanonicalErrorEntry[]
  readonly errorFactories: Readonly<Record<string, AnyErrorDeclaration>>
}

const responsePlans = new WeakMap<object, CanonicalResponsePlan>()
function compileRuntimeSchema(
  schema: AnySchema,
  location: 'body' | 'headers' | 'response'
): RuntimeSchemaExecutionPlan {
  return compileSchemaExecution(schema, { location }) as unknown as RuntimeSchemaExecutionPlan
}

function compileResponsePlan(definition: AnyRouteResponse): CanonicalResponsePlan {
  const cached = responsePlans.get(definition)
  if (cached !== undefined) return cached

  const body = definition.body
  const plan: CanonicalResponsePlan = {
    definition,
    ...(definition.contentType === undefined ? {} : { expectedContentType: mimeEssence(definition.contentType) }),
    ...(definition.headers === undefined ? {} : { headers: compileRuntimeSchema(definition.headers, 'headers') }),
    ...('schema' in body ? { body: compileRuntimeSchema(body.schema, 'response') } : {}),
  }
  responsePlans.set(definition, plan)
  return plan
}

function compileResponses(responses: Readonly<Record<number, AnyRouteResponse>>): readonly CanonicalResponseEntry[] {
  return Object.entries(responses).map(([status, definition]) => [Number(status), compileResponsePlan(definition)])
}

function compileContractErrors(contract: Contract): readonly CanonicalErrorEntry[] {
  const state = getContractState(contract)
  if (state.canonicalErrors !== undefined) return state.canonicalErrors as readonly CanonicalErrorEntry[]
  const errors = Object.entries(contract.errors).map(
    ([status, declarations]) =>
      [
        Number(status),
        declarations.map((declaration) => ({
          declaration,
          ...(declaration.data === undefined ? {} : { data: compileRuntimeSchema(declaration.data, 'response') }),
        })),
      ] as const
  )
  state.canonicalErrors = errors
  return errors
}

function compileRoutePlan<Direction extends object>(
  compiled: CompiledContractRoute,
  direction: Direction
): CanonicalRoutePlan & Direction {
  const route = compiled.route
  const body = 'body' in route ? route.body : undefined

  const plan = {
    ...direction,
    compiled,
    metadata: { key: compiled.key, method: compiled.method, path: compiled.path },
    hasInput: compiled.pathParameters.length > 0 || 'query' in route || 'headers' in route || body !== undefined,
    ...('headers' in route ? { headers: compileRuntimeSchema(route.headers, 'headers') } : {}),
    ...(body === undefined
      ? {}
      : {
          body: {
            declaration: body,
            expectedContentType: mimeEssence(body.contentType),
            schema: compileRuntimeSchema(body.schema, 'body'),
          },
        }),
    responses: compileResponses(route.responses),
  }
  return plan
}

/** Directional compilers share schema plans but retain only their own wire operations. */
export function createContractCompiler<Direction extends object>(
  specialize: (compiled: CompiledContractRoute) => Direction
): (
  contract: Contract,
  selectedRoutes?: readonly CompiledContractRoute[]
) => CanonicalContractPlan<CanonicalRoutePlan & Direction> {
  const contracts = new WeakMap<object, CanonicalContractPlan<CanonicalRoutePlan & Direction>>()
  const routes = new WeakMap<object, CanonicalRoutePlan & Direction>()
  return (contract, selectedRoutes) => {
    const complete = selectedRoutes === undefined
    const cached = complete ? contracts.get(contract) : undefined
    if (cached !== undefined) return cached
    const errors = compileContractErrors(contract)
    const plan = {
      routes: (selectedRoutes ?? compileContractRoutes(contract)).map((compiled) => {
        let route = routes.get(compiled)
        if (route === undefined) {
          route = compileRoutePlan(compiled, specialize(compiled))
          routes.set(compiled, route)
        }
        return route
      }),
      errors,
      errorFactories: errors.length === 0 ? {} : errorFactories(contract.errors),
    }
    if (complete) contracts.set(contract, plan)
    return plan
  }
}
