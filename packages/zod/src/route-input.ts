import type { Route } from '@hulla/api'
import type { RouterParamsForRoute } from '@hulla/api'
import { routerParamsForRouteValue } from '@hulla/api/integration'
import type { CodecSchema } from '@hulla/api/validation'
import * as z from 'zod/v4'
import { codec } from './codec'

type RouteProperty<RouteType, Key extends PropertyKey> = RouteType extends {
  readonly [Property in Key]: infer Value
}
  ? Value
  : undefined

type MergeShapes<Left extends z.core.$ZodShape, Right extends z.core.$ZodShape> = Omit<Left, keyof Right> & Right

type DefinedRouterParams<RouteType extends Route> = Exclude<RouterParamsForRoute<RouteType>, undefined>

type RouteParamsSchema<RouteType extends Route> =
  RouteProperty<RouteType, 'params'> extends infer RouteParams extends z.core.$ZodType ? RouteParams : undefined

type ZodParamsSchema<RouteType extends Route> = [DefinedRouterParams<RouteType>] extends [never]
  ? RouteParamsSchema<RouteType>
  : DefinedRouterParams<RouteType> extends infer RouterParams extends z.core.$ZodType
    ? RouteProperty<RouteType, 'params'> extends infer RouteParams extends z.core.$ZodType
      ? RouterParams extends z.ZodObject<infer RouterShape>
        ? RouteParams extends z.ZodObject<infer RouteShape>
          ? z.ZodObject<MergeShapes<RouterShape, RouteShape>>
          : z.ZodIntersection<RouterParams, RouteParams>
        : z.ZodIntersection<RouterParams, RouteParams>
      : RouterParams
    : RouteParamsSchema<RouteType>

type ZodDescriptorSchema<Value> = Value extends { readonly schema: infer Schema extends z.core.$ZodType }
  ? Schema
  : undefined

type DefinedSchemaField<Name extends PropertyKey, Schema> = [Schema] extends [undefined]
  ? object
  : Schema extends z.core.$ZodType
    ? { readonly [Key in Name]: Schema }
    : never

type ZodRouteInputFields<RouteType extends Route> = DefinedSchemaField<'params', ZodParamsSchema<RouteType>> &
  DefinedSchemaField<'query', ZodDescriptorSchema<RouteProperty<RouteType, 'query'>>> &
  DefinedSchemaField<'headers', RouteProperty<RouteType, 'headers'>> &
  DefinedSchemaField<'body', ZodDescriptorSchema<RouteProperty<RouteType, 'body'>>>

type ZodRouteInputShape<RouteType extends Route> = {
  [Key in keyof ZodRouteInputFields<RouteType>]: Extract<ZodRouteInputFields<RouteType>[Key], z.core.$ZodType>
}

type ZodCompatibleRoute<RouteType extends Route> =
  DefinedRouterParams<RouteType> extends z.core.$ZodType | never
    ? RouteProperty<RouteType, 'params'> extends z.core.$ZodType | undefined
      ? RouteProperty<RouteType, 'query'> extends { readonly schema: z.core.$ZodType } | undefined
        ? RouteProperty<RouteType, 'headers'> extends z.core.$ZodType | undefined
          ? RouteProperty<RouteType, 'body'> extends { readonly schema: z.core.$ZodType } | undefined
            ? unknown
            : never
          : never
        : never
      : never
    : never

type NativeZodRouteInputSchema<RouteType extends Route> = z.ZodObject<ZodRouteInputShape<RouteType>>

export type ZodRouteInputSchema<RouteType extends Route> = CodecSchema<
  z.input<NativeZodRouteInputSchema<RouteType>>,
  z.output<NativeZodRouteInputSchema<RouteType>>,
  NativeZodRouteInputSchema<RouteType>
>

function assertZodSchema(value: unknown, field: string): asserts value is z.core.$ZodType {
  if (!(value instanceof z.ZodType)) throw new TypeError(`Route ${field} must use a Zod schema`)
}

/** Combines every declared route input into one Zod-native application input schema. */
export function routeInput<const RouteType extends Route>(
  route: RouteType & ZodCompatibleRoute<RouteType>
): ZodRouteInputSchema<RouteType> {
  if (typeof route !== 'object' || route === null || route.kind !== 'route') {
    throw new TypeError('Route input must be a route')
  }

  const shape: Record<string, z.core.$ZodType> = {}
  const routerParams = routerParamsForRouteValue(route)
  const routeParams = 'params' in route ? route.params : undefined

  if (routerParams !== undefined) assertZodSchema(routerParams, 'router params')
  if (routeParams !== undefined) assertZodSchema(routeParams, 'params')
  if (routerParams !== undefined && routeParams !== undefined) {
    shape['params'] =
      routerParams instanceof z.ZodObject && routeParams instanceof z.ZodObject
        ? z.object({ ...routerParams.shape, ...routeParams.shape })
        : z.intersection(routerParams, routeParams)
  } else if (routerParams !== undefined || routeParams !== undefined) {
    shape['params'] = (routerParams ?? routeParams) as z.core.$ZodType
  }

  if ('query' in route) {
    assertZodSchema(route.query.schema, 'query')
    shape['query'] = route.query.schema
  }
  if ('headers' in route) {
    assertZodSchema(route.headers, 'headers')
    shape['headers'] = route.headers
  }
  if ('body' in route) {
    assertZodSchema(route.body.schema, 'body')
    shape['body'] = route.body.schema
  }

  return codec(z.object(shape)) as ZodRouteInputSchema<RouteType>
}
