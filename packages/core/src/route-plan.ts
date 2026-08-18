import type { CompiledContractRoute } from './compiler'
import type { RouteMetadata } from './context'
import type { Contract } from './contract'
import { compileContractRoutes } from './contract-compiler'
import { getContractState } from './contract-state'
import {
  compilePathParameterDecoder,
  compilePathParameterEncoder,
  type PathParameterDecoder,
  type PathParameterEncoder,
} from './parameters'
import {
  compileQueryDecoder,
  compileQueryEncoder,
  normalizeRequestQuery,
  type QueryDecoder,
  type QueryEncoder,
} from './query'
import { mimeEssence, type AnyRequestBody, type AnyRequestQuery } from './request'
import type { AnyRouteResponse } from './response'
import { compileSchemaExecution, type AnySchema, type SchemaStep } from './validation'

type RuntimeQuery = AnyRequestQuery
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
  readonly errors: readonly CanonicalResponseEntry[]
}

const responsePlans = new WeakMap<object, CanonicalResponsePlan>()
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

function compileRoutePlan(compiled: CompiledContractRoute): CanonicalRoutePlan {
  const route = compiled.route
  const query = 'query' in route ? (normalizeRequestQuery(route.query as AnyRequestQuery) as RuntimeQuery) : undefined
  const body = 'body' in route ? route.body : undefined
  const hasPathParameters = compiled.pathParameters.length > 0

  return {
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
}

/** @internal Compiles route-invariant client/server execution data once per contract. */
export function compileCanonicalContract(contract: Contract): CanonicalContractPlan {
  const routes = compileContractRoutes(contract)
  const state = getContractState(contract)
  if (state.canonical !== undefined) return state.canonical as CanonicalContractPlan
  const plan = {
    routes: routes.map(compileRoutePlan),
    errors: compileResponses(contract.errors),
  }
  state.canonical = plan
  return plan
}
