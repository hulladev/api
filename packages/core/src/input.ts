import type { AnyRequestBody, AnyRequestQuery } from './request'
import type { Route } from './route'
import type { AnySchema, ObjectSchema, SchemaOutput } from './validation'

type SchemaValue<Schema> = Schema extends AnySchema ? SchemaOutput<Schema> : Record<never, never>

type RequestField<Name extends string, Declaration> = Declaration extends AnyRequestQuery
  ? { readonly [Key in Name]: SchemaOutput<Declaration['schema']> }
  : Declaration extends AnyRequestBody
    ? { readonly [Key in Name]: SchemaOutput<Declaration['schema']> }
    : Declaration extends AnySchema
      ? { readonly [Key in Name]: SchemaOutput<Declaration> }
      : object

type ParamsField<RouterParams, RouteParams> = RouterParams extends AnySchema
  ? { readonly params: SchemaValue<RouterParams> & SchemaValue<RouteParams> }
  : RouteParams extends AnySchema
    ? { readonly params: SchemaValue<RouteParams> }
    : object

export type RouteInput<
  RouteType extends Route,
  RouterParams extends ObjectSchema | undefined = undefined,
> = ParamsField<RouterParams, RouteType['params']> &
  RequestField<'query', RouteType['query']> &
  RequestField<'headers', RouteType['headers']> &
  RequestField<'body', RouteType['body']>
