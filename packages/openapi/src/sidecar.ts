import type {
  AnyRequestBody,
  AnyErrorDeclaration,
  AnyRouteResponse,
  AnyRouter,
  Contract,
  ErrorWire,
  JsonValue,
  NormalizedErrorStatusMap,
  Route,
  RouterParamsForRoute,
} from '@hulla/api'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import type {
  ComponentsObject,
  ExternalDocumentationObject,
  InfoObject,
  JSONSchema,
  OpenAPIVersion,
  SecurityRequirementObject,
  ServerObject,
  TagObject,
} from './types'

export type OpenAPIExtensions = Readonly<Record<`x-${string}`, JsonValue>>

export type OpenAPIExample<Value> =
  | {
      readonly summary?: string
      readonly description?: string
      readonly value: Value
      readonly externalValue?: never
    }
  | {
      readonly summary?: string
      readonly description?: string
      readonly value?: never
      readonly externalValue: string
    }

export type OpenAPIParameterDocumentation<Value = JsonValue> = {
  readonly description?: string
  readonly deprecated?: boolean
  readonly example?: Value extends JsonValue ? Value : JsonValue
  readonly extensions?: OpenAPIExtensions
}

type SchemaInput<Schema> = Schema extends StandardSchemaV1 ? StandardSchemaV1.InferInput<Schema> : never
type SchemaKeys<Schema> = Schema extends StandardSchemaV1
  ? Extract<keyof StandardSchemaV1.InferInput<Schema>, string>
  : never
type SchemaValue<Schema, Key extends PropertyKey> = Schema extends StandardSchemaV1
  ? Key extends keyof SchemaInput<Schema>
    ? SchemaInput<Schema>[Key]
    : never
  : never

type RequestBodyWireValue<Body> = Body extends AnyRequestBody
  ? Body['representation'] extends 'bytes'
    ? string
    : Body['representation'] extends 'form-data'
      ? Readonly<Record<string, JsonValue>>
      : SchemaInput<Body['schema']>
  : never

type ResponseWireValue<Response> = Response extends AnyRouteResponse
  ? Response['body'] extends { readonly kind: 'empty' }
    ? undefined
    : Response['body'] extends { readonly kind: 'bytes' }
      ? string
      : Response['body'] extends { readonly kind: 'form-data' }
        ? Readonly<Record<string, JsonValue>>
        : Response['body'] extends { readonly schema: infer Schema }
          ? SchemaInput<Schema>
          : unknown
  : unknown

type ParameterDocumentation<Schema> = [SchemaKeys<Schema>] extends [never]
  ? never
  : {
      readonly [Key in SchemaKeys<Schema>]?: OpenAPIParameterDocumentation<SchemaValue<Schema, Key>>
    }

export type OpenAPIRequestDocumentation<RouteType extends Route> = {
  readonly path?: ParameterDocumentation<RouteType['params'] | RouterParamsForRoute<RouteType>>
  readonly query?: RouteType['query'] extends StandardSchemaV1 ? ParameterDocumentation<RouteType['query']> : never
  readonly headers?: ParameterDocumentation<RouteType['headers']>
  readonly body?: RouteType['body'] extends AnyRequestBody
    ? {
        readonly description?: string
        readonly required?: boolean
        readonly schema?: JSONSchema
        readonly examples?: Readonly<Record<string, OpenAPIExample<RequestBodyWireValue<RouteType['body']>>>>
        readonly extensions?: OpenAPIExtensions
      }
    : never
}

export type OpenAPIResponseDocumentation<Response extends AnyRouteResponse = AnyRouteResponse> = {
  readonly description: string
  readonly schema?: JSONSchema
  readonly headers?: Response['headers'] extends StandardSchemaV1 ? ParameterDocumentation<Response['headers']> : never
  readonly examples?: Readonly<Record<string, OpenAPIExample<ResponseWireValue<Response>>>>
  readonly extensions?: OpenAPIExtensions
}

export type OpenAPIErrorResponseDocumentation<Errors extends readonly AnyErrorDeclaration[]> = {
  readonly description: string
  readonly schema?: JSONSchema
  readonly examples?: Readonly<Record<string, OpenAPIExample<ErrorWire<Errors>>>>
  readonly extensions?: OpenAPIExtensions
}

type ResponseDocumentation<RouteType extends Route, Errors extends NormalizedErrorStatusMap> = {
  readonly [Status in keyof RouteType['responses'] | keyof Errors]: Status extends keyof RouteType['responses']
    ? OpenAPIResponseDocumentation<Extract<RouteType['responses'][Status], AnyRouteResponse>>
    : Status extends keyof Errors
      ? OpenAPIErrorResponseDocumentation<Extract<Errors[Status], readonly AnyErrorDeclaration[]>>
      : never
}

export type IncludedOpenAPIRouteDocumentation<RouteType extends Route, Errors extends NormalizedErrorStatusMap> = {
  readonly include?: true
  readonly operationId?: string
  readonly summary?: string
  readonly description?: string
  readonly tags?: readonly string[]
  readonly deprecated?: boolean
  readonly externalDocs?: ExternalDocumentationObject
  readonly security?: readonly SecurityRequirementObject[]
  readonly request?: OpenAPIRequestDocumentation<RouteType>
  readonly responses: ResponseDocumentation<RouteType, Errors>
  readonly extensions?: OpenAPIExtensions
}

export type ExcludedOpenAPIRouteDocumentation = {
  readonly include: false
  readonly reason: string
}

export type OpenAPIRouteDocumentation<RouteType extends Route, Errors extends NormalizedErrorStatusMap> =
  | IncludedOpenAPIRouteDocumentation<RouteType, Errors>
  | ExcludedOpenAPIRouteDocumentation

type RouterDocumentation<RouterType, Errors extends NormalizedErrorStatusMap> = RouterType extends AnyRouter
  ? {
      readonly [Key in Exclude<Extract<keyof RouterType, string>, '$meta'>]: RouterType[Key] extends Route
        ? OpenAPIRouteDocumentation<RouterType[Key], Errors>
        : never
    }
  : never

type ContractDocumentationRoutes<ContractType extends Contract> = {
  readonly [Key in keyof ContractType['routes']]: ContractType['routes'][Key] extends Route
    ? OpenAPIRouteDocumentation<ContractType['routes'][Key], ContractType['errors']>
    : RouterDocumentation<ContractType['routes'][Key], ContractType['errors']>
}

export type OpenAPIDocstringOptions = {
  /** The TypeScript module containing the contract declaration. */
  readonly source: string | URL
  /** Exported contract variable to inspect. Defaults to `contract`. */
  readonly contract?: string
}

export type OpenAPIDocumentation<ContractType extends Contract> = {
  readonly openapi?: OpenAPIVersion
  readonly info: InfoObject
  readonly servers?: readonly ServerObject[]
  readonly tags?: readonly TagObject[]
  readonly security?: readonly SecurityRequirementObject[]
  readonly externalDocs?: ExternalDocumentationObject
  readonly components?: ComponentsObject
  readonly routes: ContractDocumentationRoutes<ContractType>
  /** Build-time-only JSDoc extraction. Explicit sidecar values take precedence. */
  readonly docstrings?: OpenAPIDocstringOptions
  readonly extensions?: OpenAPIExtensions
}

export type DefinedOpenAPI<ContractType extends Contract = Contract> = {
  readonly kind: 'hulla-openapi'
  readonly contract: ContractType
  readonly documentation: OpenAPIDocumentation<ContractType>
}

/** Defines build-time OpenAPI documentation without changing the runtime contract. */
export function defineOpenAPI<const ContractType extends Contract>(
  contract: ContractType,
  documentation: OpenAPIDocumentation<ContractType>
): DefinedOpenAPI<ContractType> {
  return { kind: 'hulla-openapi', contract, documentation }
}
