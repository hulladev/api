import type { AnyRouteResponse, ResponseHeaders, RouteResponses } from '../contract/response'
import type { StreamSource } from '../stream'
import type { AnySchema, SchemaOutbound } from '../validation'

type ResponseBodyFields<ResponseDefinition extends AnyRouteResponse> = ResponseDefinition['body'] extends {
  readonly kind: 'empty'
}
  ? { readonly body?: never }
  : ResponseDefinition['body'] extends { readonly kind: 'raw' }
    ? { readonly body: unknown; readonly headers?: never }
    : ResponseDefinition['body'] extends {
          readonly kind: 'stream'
          readonly schema: infer Schema extends AnySchema
        }
      ? { readonly body: StreamSource<SchemaOutbound<Schema>> }
      : ResponseDefinition['body'] extends { readonly kind: 'stream' }
        ? { readonly body: StreamSource<Uint8Array> }
        : ResponseDefinition['body'] extends { readonly schema: infer Schema extends AnySchema }
          ? { readonly body: SchemaOutbound<Schema> }
          : never

type ResponseHeaderFields<ResponseDefinition extends AnyRouteResponse> = ResponseDefinition['body'] extends {
  readonly kind: 'raw'
}
  ? object
  : ResponseDefinition['headers'] extends ResponseHeaders
    ? { readonly headers: SchemaOutbound<ResponseDefinition['headers']> }
    : { readonly headers?: Readonly<Record<string, string>> }

type ResponseBodyArguments<ResponseDefinition extends AnyRouteResponse> = ResponseDefinition['body'] extends {
  readonly kind: 'empty'
}
  ? readonly [body?: undefined]
  : readonly [body: ResponseBodyFields<ResponseDefinition>['body']]

type ResponseHeaderArguments<ResponseDefinition extends AnyRouteResponse> = ResponseDefinition['body'] extends {
  readonly kind: 'raw'
}
  ? readonly []
  : ResponseDefinition['headers'] extends ResponseHeaders
    ? readonly [headers: SchemaOutbound<ResponseDefinition['headers']>]
    : readonly [headers?: Readonly<Record<string, string>>]

export type ServerResponseResultFor<Status extends number, ResponseDefinition extends AnyRouteResponse> = {
  readonly status: Status
} & ResponseBodyFields<ResponseDefinition> &
  ResponseHeaderFields<ResponseDefinition>

export type ServerResponseResult<Responses extends RouteResponses> = {
  readonly [Status in Extract<keyof Responses, number>]: ServerResponseResultFor<Status, Responses[Status]>
}[Extract<keyof Responses, number>]

export type ServerResponseFactory<Responses extends RouteResponses> = <Status extends Extract<keyof Responses, number>>(
  status: Status,
  ...arguments_: readonly [...ResponseBodyArguments<Responses[Status]>, ...ResponseHeaderArguments<Responses[Status]>]
) => ServerResponseResultFor<Status, Responses[Status]>

type UniversalServerResponseFactory = <
  Responses extends RouteResponses,
  Status extends Extract<keyof Responses, number>,
>(
  status: Status,
  ...arguments_: readonly [...ResponseBodyArguments<Responses[Status]>, ...ResponseHeaderArguments<Responses[Status]>]
) => ServerResponseResultFor<Status, Responses[Status]>

export type ServerErrorResult<
  Errors extends RouteResponses,
  Status extends Extract<keyof Errors, number> = Extract<keyof Errors, number>,
> = {
  readonly [CurrentStatus in Status]: ServerResponseResultFor<CurrentStatus, Errors[CurrentStatus]>
}[Status]

export const createServerResponse = ((status: number, body?: unknown, headers?: Readonly<Record<string, string>>) => ({
  status,
  ...(body === undefined ? {} : { body }),
  ...(headers === undefined ? {} : { headers }),
})) as unknown as UniversalServerResponseFactory
