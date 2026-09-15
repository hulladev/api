import { compileSchemaExecution, type SchemaExecutor } from '../validation'
import { mimeEssence } from './request'
import type { AnyRouteResponse } from './response'

export type ResponseSchema = {
  readonly definition: AnyRouteResponse
  readonly expectedContentType?: string
  readonly headers?: SchemaExecutor
  readonly body?: SchemaExecutor
}

const responseSchemas = new WeakMap<object, ResponseSchema>()

export function compileResponseSchema(definition: AnyRouteResponse): ResponseSchema {
  const cached = responseSchemas.get(definition)
  if (cached !== undefined) return cached

  const body = definition.body
  const plan: ResponseSchema = {
    definition,
    ...(definition.contentType === undefined ? {} : { expectedContentType: mimeEssence(definition.contentType) }),
    ...(definition.headers === undefined
      ? {}
      : { headers: compileSchemaExecution(definition.headers, { location: 'headers' }) as SchemaExecutor }),
    ...('schema' in body ? { body: compileSchemaExecution(body.schema, { location: 'response' }) } : {}),
  }
  responseSchemas.set(definition, plan)
  return plan
}
