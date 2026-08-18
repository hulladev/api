import type { AnyRequestBody, AnyRequestQuery } from './request'
import type { Route } from './route'
import type { AnySchema, ObjectSchema, SchemaOutbound, SchemaOutput } from './validation'

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
