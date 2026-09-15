import type { JsonValue } from '@hulla/api'

export type OpenAPIVersion = '3.1.2' | '3.2.0'

export type ReferenceObject = {
  readonly $ref: string
  readonly summary?: string
  readonly description?: string
}

export type JSONSchema =
  | boolean
  | {
      readonly [keyword: string]: unknown
      readonly $ref?: string
      readonly $defs?: Readonly<Record<string, JSONSchema>>
      readonly type?: string | readonly string[]
      readonly properties?: Readonly<Record<string, JSONSchema>>
      readonly required?: readonly string[]
      readonly items?: JSONSchema
      readonly enum?: readonly JsonValue[]
      readonly const?: JsonValue
      readonly description?: string
      readonly format?: string
    }

export type ExampleObject = {
  readonly summary?: string
  readonly description?: string
  readonly value?: unknown
  readonly externalValue?: string
}

export type MediaTypeObject = {
  readonly schema?: JSONSchema | ReferenceObject
  readonly example?: unknown
  readonly examples?: Readonly<Record<string, ExampleObject | ReferenceObject>>
  readonly encoding?: Readonly<Record<string, unknown>>
}

export type ParameterObject = {
  readonly name: string
  readonly in: 'query' | 'header' | 'path' | 'cookie'
  readonly description?: string
  readonly required?: boolean
  readonly deprecated?: boolean
  readonly allowEmptyValue?: boolean
  readonly style?: string
  readonly explode?: boolean
  readonly allowReserved?: boolean
  readonly schema?: JSONSchema | ReferenceObject
  readonly example?: unknown
  readonly examples?: Readonly<Record<string, ExampleObject | ReferenceObject>>
  readonly content?: Readonly<Record<string, MediaTypeObject>>
  readonly [extension: `x-${string}`]: JsonValue
}

export type RequestBodyObject = {
  readonly description?: string
  readonly required?: boolean
  readonly content: Readonly<Record<string, MediaTypeObject>>
  readonly [extension: `x-${string}`]: JsonValue
}

export type HeaderObject = Omit<ParameterObject, 'name' | 'in'>

export type ResponseObject = {
  readonly description: string
  readonly headers?: Readonly<Record<string, HeaderObject | ReferenceObject>>
  readonly content?: Readonly<Record<string, MediaTypeObject>>
  readonly [extension: `x-${string}`]: JsonValue
}

export type SecurityRequirementObject = Readonly<Record<string, readonly string[]>>

export type OperationObject = {
  readonly tags?: readonly string[]
  readonly summary?: string
  readonly description?: string
  readonly externalDocs?: ExternalDocumentationObject
  readonly operationId?: string
  readonly parameters?: readonly (ParameterObject | ReferenceObject)[]
  readonly requestBody?: RequestBodyObject | ReferenceObject
  readonly responses: Readonly<Record<string, ResponseObject | ReferenceObject>>
  readonly deprecated?: boolean
  readonly security?: readonly SecurityRequirementObject[]
  readonly [extension: `x-${string}`]: JsonValue
}

export type PathItemObject = {
  readonly summary?: string
  readonly description?: string
  readonly parameters?: readonly (ParameterObject | ReferenceObject)[]
  readonly get?: OperationObject
  readonly put?: OperationObject
  readonly post?: OperationObject
  readonly delete?: OperationObject
  readonly patch?: OperationObject
  readonly query?: OperationObject
  readonly [extension: `x-${string}`]: JsonValue
}

export type InfoObject = {
  readonly title: string
  readonly version: string
  readonly summary?: string
  readonly description?: string
  readonly termsOfService?: string
  readonly contact?: {
    readonly name?: string
    readonly url?: string
    readonly email?: string
  }
  readonly license?: {
    readonly name: string
    readonly identifier?: string
    readonly url?: string
  }
  readonly [extension: `x-${string}`]: JsonValue
}

export type ServerObject = {
  readonly url: string
  readonly description?: string
  readonly variables?: Readonly<
    Record<string, { readonly default: string; readonly description?: string; readonly enum?: readonly string[] }>
  >
}

export type TagObject = {
  readonly name: string
  readonly description?: string
  readonly externalDocs?: ExternalDocumentationObject
}

export type ExternalDocumentationObject = {
  readonly url: string
  readonly description?: string
}

export type SecuritySchemeObject = {
  readonly type: 'apiKey' | 'http' | 'mutualTLS' | 'oauth2' | 'openIdConnect'
  readonly description?: string
  readonly name?: string
  readonly in?: 'query' | 'header' | 'cookie'
  readonly scheme?: string
  readonly bearerFormat?: string
  readonly flows?: Readonly<Record<string, unknown>>
  readonly openIdConnectUrl?: string
}

export type ComponentsObject = {
  readonly schemas?: Readonly<Record<string, JSONSchema>>
  readonly responses?: Readonly<Record<string, ResponseObject | ReferenceObject>>
  readonly parameters?: Readonly<Record<string, ParameterObject | ReferenceObject>>
  readonly examples?: Readonly<Record<string, ExampleObject | ReferenceObject>>
  readonly requestBodies?: Readonly<Record<string, RequestBodyObject | ReferenceObject>>
  readonly headers?: Readonly<Record<string, HeaderObject | ReferenceObject>>
  readonly securitySchemes?: Readonly<Record<string, SecuritySchemeObject | ReferenceObject>>
}

export type OpenAPIDocument = {
  readonly openapi: OpenAPIVersion | (string & {})
  readonly info: InfoObject
  readonly jsonSchemaDialect?: string
  readonly servers?: readonly ServerObject[]
  readonly paths: Readonly<Record<string, PathItemObject>>
  readonly components?: ComponentsObject
  readonly security?: readonly SecurityRequirementObject[]
  readonly tags?: readonly TagObject[]
  readonly externalDocs?: ExternalDocumentationObject
  readonly [extension: `x-${string}`]: JsonValue
}

export type OpenAPIDiagnostic = {
  readonly severity: 'warning' | 'error'
  readonly location: string
  readonly message: string
}
