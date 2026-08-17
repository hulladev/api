import type { AnyRouteResponse, ResponseHeaders, RouteResponses } from '../response'
import type { StreamSource } from '../stream'
import type { AnySchema, SchemaOutput } from '../validation'

type ResponseBodyFields<ResponseDefinition extends AnyRouteResponse> = ResponseDefinition['body'] extends {
  readonly kind: 'empty'
}
  ? { readonly body?: never }
  : ResponseDefinition['body'] extends { readonly kind: 'raw' }
    ? { readonly body: Response; readonly headers?: never }
    : ResponseDefinition['body'] extends {
          readonly kind: 'stream'
          readonly schema: infer Schema extends AnySchema
        }
      ? { readonly body: StreamSource<SchemaOutput<Schema>> }
      : ResponseDefinition['body'] extends { readonly kind: 'stream' }
        ? { readonly body: StreamSource<Uint8Array> }
        : ResponseDefinition['body'] extends { readonly schema: infer Schema extends AnySchema }
          ? { readonly body: SchemaOutput<Schema> }
          : never

type ResponseHeaderFields<ResponseDefinition extends AnyRouteResponse> = ResponseDefinition['body'] extends {
  readonly kind: 'raw'
}
  ? object
  : ResponseDefinition['headers'] extends ResponseHeaders
    ? { readonly headers: SchemaOutput<ResponseDefinition['headers']> }
    : { readonly headers?: HeadersInit }

export type ServerResponseResultFor<Status extends number, ResponseDefinition extends AnyRouteResponse> = {
  readonly status: Status
} & ResponseBodyFields<ResponseDefinition> &
  ResponseHeaderFields<ResponseDefinition>

export type ServerResponseResult<Responses extends RouteResponses> = {
  readonly [Status in Extract<keyof Responses, number>]: ServerResponseResultFor<Status, Responses[Status]>
}[Extract<keyof Responses, number>]

export type ServerErrorResult<
  Errors extends RouteResponses,
  Status extends Extract<keyof Errors, number> = Extract<keyof Errors, number>,
> = {
  readonly [CurrentStatus in Status]: ServerResponseResultFor<CurrentStatus, Errors[CurrentStatus]>
}[Status]
