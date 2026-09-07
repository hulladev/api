import type { ObjectSchema } from '../validation'
import { compilePathParameterDecoder, type PathParameterDecoder } from './parameters'
import { createContractCompiler, type CanonicalRoutePlan } from './plan'
import { compileQueryDecoder, type QueryDecoder } from './query'

export type ServerRoutePlan = CanonicalRoutePlan & {
  readonly pattern: readonly string[]
  readonly decodePath?: PathParameterDecoder
  readonly decodeQuery?: QueryDecoder<ObjectSchema>
}

export const compileServerContract = createContractCompiler<
  Pick<ServerRoutePlan, 'decodePath' | 'decodeQuery' | 'pattern'>
>((compiled) => {
  const route = compiled.route
  return {
    pattern: pathSegments(compiled.path),
    ...(compiled.pathParameters.length === 0
      ? {}
      : { decodePath: compilePathParameterDecoder(compiled.pathParameters) }),
    ...('query' in route ? { decodeQuery: compileQueryDecoder(route.query as ObjectSchema) } : {}),
  }
})

const emptyPattern: readonly string[] = []

function pathSegments(path: string): readonly string[] {
  if (path === '' || path === '/') return emptyPattern
  return path.startsWith('/') ? path.slice(1).split('/') : path.split('/')
}
