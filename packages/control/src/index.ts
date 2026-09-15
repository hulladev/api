import type { Contract } from '@hulla/api'
import {
  createClient as createAPIClient,
  type ClientContextInput,
  type ClientContractFor,
  type ClientFor,
  type ClientOptions,
  type ClientSource,
} from '@hulla/api/client'
import { err, ok, type Result } from '@hulla/control'

/** Distributes over response unions, retaining each response's body and headers. */
export type SuccessResponse<Response> = Response extends { readonly status: infer Status extends number }
  ? number extends Status
    ? Response
    : `${Status}` extends `2${number}${number}`
      ? Response
      : never
  : never

export type FailureResponse<Response> = Response extends { readonly status: infer Status extends number }
  ? number extends Status
    ? Response
    : `${Status}` extends `2${number}${number}`
      ? never
      : Response
  : never

/** A declared non-2xx response, including its status-specific body and headers. */
export type HTTPFailure<Response> = Response extends unknown
  ? { readonly kind: 'http'; readonly response: Response }
  : never

/** A rejected call. JavaScript transports, codecs, and middleware may throw any value. */
export type RequestFailure = { readonly kind: 'request'; readonly cause: unknown }

export type ClientResult<Response> = Result<
  SuccessResponse<Response>,
  HTTPFailure<FailureResponse<Response>> | RequestFailure
>

/** Preserves route arguments, nested routers, and selected route/router clients. */
export type ControlClient<Client> = Client extends (...args: infer Args) => Promise<infer Response>
  ? (...args: Args) => Promise<ClientResult<Response>>
  : { readonly [Key in keyof Client]: ControlClient<Client[Key]> }

export type ControlClientOptions<Context extends object, Source extends ClientSource> = Omit<
  ClientOptions<Context, ClientContractFor<Source>, 'return'>,
  'errorMode'
> & { readonly errorMode?: never }

type EmptyContext = Record<string, never>

export function createClient<
  const C extends Contract,
  const Factory extends (input: ClientContextInput<C>) => object | PromiseLike<object>,
>(
  source: C,
  options: ControlClientOptions<Awaited<ReturnType<Factory>>, NoInfer<C>> & { readonly context: Factory }
): ControlClient<ClientFor<C>>
export function createClient<const C extends Contract>(
  source: C,
  options: ControlClientOptions<EmptyContext, NoInfer<C>> & { readonly context?: undefined }
): ControlClient<ClientFor<C>>
export function createClient<
  const Source extends Exclude<ClientSource, Contract>,
  Context extends object = EmptyContext,
>(source: Source, options: ControlClientOptions<Context, NoInfer<Source>>): ControlClient<ClientFor<Source>>
export function createClient(source: unknown, configuration: unknown): unknown {
  const options = configuration as ClientOptions<object, Contract, 'return'>
  const build = createAPIClient as (source: ClientSource, options: ClientOptions<object, Contract, 'return'>) => unknown
  const client = build(source as ClientSource, { ...options, errorMode: 'return' })
  return wrapClient(client)
}

function wrapClient(client: unknown): unknown {
  if (typeof client === 'function') {
    return async (...args: unknown[]) => {
      try {
        const response = (await client(...args)) as { readonly status: number }
        return response.status >= 200 && response.status < 300 ? ok(response) : err({ kind: 'http' as const, response })
      } catch (cause) {
        return err({ kind: 'request' as const, cause })
      }
    }
  }
  return Object.freeze(
    Object.fromEntries(
      Object.entries(client as Record<string, unknown>).map(([key, value]) => [key, wrapClient(value)])
    )
  )
}
