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

declare const producedServerResponseType: unique symbol

export type ProducedServerResponse<Value> = Value & {
  readonly [producedServerResponseType]: Value
}

export type ProducedServerResponseValue<Value> = Value extends {
  readonly [producedServerResponseType]: infer ResponseValue
}
  ? ResponseValue
  : never

type MatchingResponse<Actual, Allowed> = Allowed extends { readonly status: infer Status }
  ? Actual extends { readonly status: Status }
    ? Allowed
    : never
  : never

type ExactResponseInput<Actual extends Allowed, Allowed> = Actual &
  Record<Exclude<keyof Actual, keyof MatchingResponse<Actual, Allowed>>, never>

export type ServerResponder<Allowed> = <const Actual extends Allowed>(
  response: ExactResponseInput<Actual, Allowed>
) => ProducedServerResponse<Actual>

type ServerErrorInput<Errors extends RouteResponses, Status extends Extract<keyof Errors, number>> = Omit<
  ServerResponseResultFor<Status, Errors[Status]>,
  'status'
>

type ExactErrorInput<Actual extends Allowed, Allowed> = Actual & Record<Exclude<keyof Actual, keyof Allowed>, never>

export type ServerErrorResponder<Errors extends RouteResponses> = <
  const Status extends Extract<keyof Errors, number>,
  const Actual extends ServerErrorInput<Errors, Status>,
>(
  status: Status,
  response: ExactErrorInput<Actual, ServerErrorInput<Errors, Status>>
) => ProducedServerResponse<Actual & { readonly status: Status }>
