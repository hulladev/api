import type { CompiledContractRoute } from '../compiler'
import type { Awaitable, RouteMetadata } from '../context'
import type { QuerySource } from '../contract/query'
import type { AnyRequestBody } from '../contract/request'
import type { ResponseHeaderValues } from '../headers'

export type AdapterPhase = 'context' | 'handler' | 'request' | 'response' | 'routing' | 'transport'

export type AdapterResponseBody = {
  readonly kind: 'bytes' | 'empty' | 'form-data' | 'json' | 'raw' | 'stream' | 'text'
  readonly value: unknown
}

export type AdapterResponse = {
  readonly status: number
  readonly headers: ResponseHeaderValues
  readonly body: AdapterResponseBody
}

export type AdapterErrorInput = {
  readonly defaultResponse: AdapterResponse
  readonly error: unknown
  readonly hostContext?: unknown
  readonly phase: AdapterPhase
  readonly request: unknown
  readonly route?: RouteMetadata
}

export type AdapterRuntimeOptions = {
  readonly onError?: (input: AdapterErrorInput) => Awaitable<AdapterResponse | undefined | void>
}

export type AdapterBody = {
  readonly value: unknown
  readonly contentType?: string
}

export type AdapterRouteInput = {
  readonly request: unknown
  readonly signal?: AbortSignal
  readonly preserveRequestBody?: boolean
  readonly hostContext?: unknown
  readonly contextInput?: Readonly<Record<string, unknown>>
  readonly params?: Readonly<Record<string, string>>
  readonly headers?: Readonly<Record<string, string>>
  readonly readHeaders?: () => Readonly<Record<string, string>>
  readonly query?: QuerySource
  readonly body?: AdapterBody
  readonly readBody?: (representation: AnyRequestBody['representation'], preserveRequest: boolean) => Promise<unknown>
}

export type AdapterDispatchInput = Omit<AdapterRouteInput, 'params'> & {
  readonly method: string
  readonly pathname: string
}

export type AdapterRoute = Pick<CompiledContractRoute, 'key' | 'method' | 'path'> & {
  readonly execute: (input: AdapterRouteInput) => Promise<AdapterResponse>
}

export type AdapterRuntime = {
  readonly routes: readonly AdapterRoute[]
}

export type AdapterHandler = (input: AdapterDispatchInput) => Promise<AdapterResponse>
