import type { StandardSchemaV1 } from '@standard-schema/spec'
import { isPromiseLike } from './execution'
import { isRecord, setOwn } from './object'
import type { AnyRequestBody, AnyRequestQuery } from './request'
import type { Route } from './route'
import { routerParamsForRouteValue, type RouterParamsForRoute } from './router'
import {
  isSchema,
  validateSchemaOutbound,
  type AnySchema,
  type ObjectSchema,
  type SchemaOutbound,
  type SchemaOutput,
} from './validation'

type SchemaInputValue<Schema> = Schema extends AnySchema ? SchemaOutbound<Schema> : Record<never, never>
type SchemaOutputValue<Schema> = Schema extends AnySchema ? SchemaOutput<Schema> : Record<never, never>

type RequestFieldInput<Name extends string, Declaration> = Declaration extends AnyRequestQuery
  ? { readonly [Key in Name]: SchemaOutbound<Declaration['schema']> }
  : Declaration extends AnyRequestBody
    ? { readonly [Key in Name]: SchemaOutbound<Declaration['schema']> }
    : Declaration extends AnySchema
      ? { readonly [Key in Name]: SchemaOutbound<Declaration> }
      : object

type RequestFieldOutput<Name extends string, Declaration> = Declaration extends AnyRequestQuery
  ? { readonly [Key in Name]: SchemaOutput<Declaration['schema']> }
  : Declaration extends AnyRequestBody
    ? { readonly [Key in Name]: SchemaOutput<Declaration['schema']> }
    : Declaration extends AnySchema
      ? { readonly [Key in Name]: SchemaOutput<Declaration> }
      : object

type ParamsFieldInput<RouterParams, RouteParams> = RouterParams extends AnySchema
  ? { readonly params: SchemaInputValue<RouterParams> & SchemaInputValue<RouteParams> }
  : RouteParams extends AnySchema
    ? { readonly params: SchemaInputValue<RouteParams> }
    : object

type ParamsFieldOutput<RouterParams, RouteParams> = RouterParams extends AnySchema
  ? { readonly params: SchemaOutputValue<RouterParams> & SchemaOutputValue<RouteParams> }
  : RouteParams extends AnySchema
    ? { readonly params: SchemaOutputValue<RouteParams> }
    : object

export type RouteInputSource<
  RouteType extends Route,
  RouterParams extends ObjectSchema | undefined = undefined,
> = ParamsFieldInput<RouterParams, RouteType['params']> &
  RequestFieldInput<'query', RouteType['query']> &
  RequestFieldInput<'headers', RouteType['headers']> &
  RequestFieldInput<'body', RouteType['body']>

export type RouteInput<
  RouteType extends Route,
  RouterParams extends ObjectSchema | undefined = undefined,
> = ParamsFieldOutput<RouterParams, RouteType['params']> &
  RequestFieldOutput<'query', RouteType['query']> &
  RequestFieldOutput<'headers', RouteType['headers']> &
  RequestFieldOutput<'body', RouteType['body']>

export type RouteInputSchema<RouteType extends Route> = StandardSchemaV1<
  RouteInputSource<RouteType, RouterParamsForRoute<RouteType>>,
  RouteInput<RouteType, RouterParamsForRoute<RouteType>>
>

type FieldSchema = {
  readonly field: string
  readonly schema: AnySchema
  readonly merge?: boolean
}

function schemaResult(
  field: FieldSchema,
  result: StandardSchemaV1.Result<unknown>
): StandardSchemaV1.Result<readonly [FieldSchema, unknown]> {
  if (result.issues !== undefined) {
    return {
      issues: result.issues.map((issue) => ({
        ...issue,
        path: [field.field, ...(issue.path ?? [])],
      })),
    }
  }
  return { value: [field, result.value] }
}

function combinedRouteInput(
  fields: readonly FieldSchema[],
  value: unknown
):
  | StandardSchemaV1.Result<Readonly<Record<string, unknown>>>
  | Promise<StandardSchemaV1.Result<Readonly<Record<string, unknown>>>> {
  if (!isRecord(value)) return { issues: [{ message: 'Route input must be an object' }] }

  const steps = fields.map((field) => {
    const result = validateSchemaOutbound(field.schema, value[field.field])
    return isPromiseLike(result)
      ? Promise.resolve(result).then((resolved) => schemaResult(field, resolved))
      : schemaResult(field, result)
  })

  const finish = (results: readonly StandardSchemaV1.Result<readonly [FieldSchema, unknown]>[]) => {
    const issues = results.flatMap((result) => result.issues ?? [])
    if (issues.length > 0) return { issues }

    const output: Record<string, unknown> = {}
    for (const result of results) {
      if (result.issues !== undefined) continue
      const [field, fieldValue] = result.value
      if (field.merge) {
        if (!isRecord(fieldValue))
          return { issues: [{ message: `Route input ${field.field} must produce an object`, path: [field.field] }] }
        const existing = output[field.field]
        const merged = isRecord(existing) ? { ...existing } : {}
        for (const [key, child] of Object.entries(fieldValue)) setOwn(merged, key, child)
        setOwn(output, field.field, merged)
      } else setOwn(output, field.field, fieldValue)
    }
    return { value: output }
  }

  return steps.some(isPromiseLike)
    ? Promise.all(steps).then((results) => finish(results))
    : finish(steps as readonly StandardSchemaV1.Result<readonly [FieldSchema, unknown]>[])
}

/** Creates a schema for a route's complete client-input to server-input transformation. */
export function routeInput<const RouteType extends Route>(route: RouteType): RouteInputSchema<RouteType> {
  if (!isRecord(route) || route.kind !== 'route') throw new TypeError('Route input schema requires a route definition')

  const fields: FieldSchema[] = []
  const routerParams = routerParamsForRouteValue(route)
  if (routerParams !== undefined) fields.push({ field: 'params', schema: routerParams, merge: true })
  if ('params' in route && isSchema(route.params)) fields.push({ field: 'params', schema: route.params, merge: true })
  if ('query' in route && route.query !== undefined) fields.push({ field: 'query', schema: route.query.schema })
  if ('headers' in route && isSchema(route.headers)) fields.push({ field: 'headers', schema: route.headers })
  if ('body' in route && route.body !== undefined) fields.push({ field: 'body', schema: route.body.schema })

  return {
    '~standard': {
      version: 1 as const,
      vendor: '@hulla/api',
      validate: (value: unknown) => combinedRouteInput(fields, value),
    },
  } as RouteInputSchema<RouteType>
}
