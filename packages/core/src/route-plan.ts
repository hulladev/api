import type { CompiledContractRoute } from './compiler'
import type { RouteMetadata } from './context'
import type { Contract } from './contract'
import { compileContractRoutes } from './contract-compiler'
import { getContractState } from './contract-state'
import { errorFactories, type AnyErrorDeclaration } from './declared-errors'
import {
  compilePathParameterDecoder,
  compilePathParameterEncoder,
  type PathParameterDecoder,
  type PathParameterEncoder,
} from './parameters'
import { compileQueryDecoder, compileQueryEncoder, type QueryDecoder, type QueryEncoder } from './query'
import { mimeEssence, type AnyRequestBody } from './request'
import type { AnyRouteResponse } from './response'
import { compileSchemaExecution, type AnySchema, type ObjectSchema, type SchemaStep } from './validation'

type RuntimeQuery = ObjectSchema
type RuntimeSchemaExecutionPlan = {
  readonly decode: (value: unknown) => SchemaStep<unknown>
  readonly encode?: (value: unknown) => SchemaStep<unknown>
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
  readonly pattern: readonly string[]
  readonly hasInput: boolean
  readonly encodePath?: PathParameterEncoder
  readonly decodePath?: PathParameterDecoder
  readonly encodeQuery?: QueryEncoder<RuntimeQuery>
  readonly decodeQuery?: QueryDecoder<RuntimeQuery>
  readonly headers?: RuntimeSchemaExecutionPlan
  readonly body?: CanonicalRequestBodyPlan
  readonly responses: readonly CanonicalResponseEntry[]
}

export type CanonicalContractPlan = {
  readonly routes: readonly CanonicalRoutePlan[]
  readonly errors: readonly CanonicalErrorEntry[]
  readonly errorFactories: Readonly<Record<string, AnyErrorDeclaration>>
}

const responsePlans = new WeakMap<object, CanonicalResponsePlan>()
const routePlans = new WeakMap<object, CanonicalRoutePlan>()
const emptyPattern: readonly string[] = []

function pathSegments(path: string): readonly string[] {
  if (path === '' || path === '/') return emptyPattern
  return path.startsWith('/') ? path.slice(1).split('/') : path.split('/')
}

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

function compileRoutePlan(compiled: CompiledContractRoute): CanonicalRoutePlan {
  const cached = routePlans.get(compiled)
  if (cached !== undefined) return cached
  const route = compiled.route
  const query = 'query' in route ? (route.query as RuntimeQuery) : undefined
  const body = 'body' in route ? route.body : undefined
  const hasPathParameters = compiled.pathParameters.length > 0

  const plan: CanonicalRoutePlan = {
    compiled,
    metadata: { key: compiled.key, method: compiled.method, path: compiled.path },
    pattern: pathSegments(compiled.path),
    hasInput: hasPathParameters || query !== undefined || 'headers' in route || body !== undefined,
    ...(hasPathParameters
      ? {
          encodePath: compilePathParameterEncoder(compiled.path, compiled.pathParameters),
          decodePath: compilePathParameterDecoder(compiled.pathParameters),
        }
      : {}),
    ...(query === undefined
      ? {}
      : {
          encodeQuery: compileQueryEncoder(query),
          decodeQuery: compileQueryDecoder(query),
        }),
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
  routePlans.set(compiled, plan)
  return plan
}

/** @internal Compiles route-invariant client/server execution data once per contract. */
export function compileCanonicalContract(
  contract: Contract,
  selectedRoutes?: readonly CompiledContractRoute[]
): CanonicalContractPlan {
  const complete = selectedRoutes === undefined
  const state = getContractState(contract)
  if (complete && state.canonical !== undefined) return state.canonical as CanonicalContractPlan
  const plannedRoutes = selectedRoutes ?? compileContractRoutes(contract)
  const errors = compileContractErrors(contract)
  const plan = {
    routes: plannedRoutes.map(compileRoutePlan),
    errors,
    errorFactories: errors.length === 0 ? {} : errorFactories(contract.errors),
  }
  if (complete) state.canonical = plan
  return plan
}
