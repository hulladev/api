import type { ObjectSchema } from '../validation'
import { compilePathParameterEncoder, type PathParameterEncoder } from './parameters'
import { createContractCompiler, type CanonicalRoutePlan } from './plan'
import { compileQueryEncoder, type QueryEncoder } from './query'

export type ClientRoutePlan = CanonicalRoutePlan & {
  readonly encodePath?: PathParameterEncoder
  readonly encodeQuery?: QueryEncoder<ObjectSchema>
}

export const compileClientContract = createContractCompiler<Pick<ClientRoutePlan, 'encodePath' | 'encodeQuery'>>(
  (compiled) => {
    const route = compiled.route
    return {
      ...(compiled.pathParameters.length === 0
        ? {}
        : { encodePath: compilePathParameterEncoder(compiled.path, compiled.pathParameters) }),
      ...('query' in route ? { encodeQuery: compileQueryEncoder(route.query as ObjectSchema) } : {}),
    }
  }
)
