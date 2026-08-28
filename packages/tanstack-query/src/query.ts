import { clientRouteIntegration } from '@hulla/api/client'

export type TanStackQueryFunctionContext = {
  readonly signal?: AbortSignal
}

type RouteCall = (...args: never[]) => Promise<unknown>
type RouteInput<Call extends RouteCall> = Parameters<Call> extends readonly [infer Input, ...unknown[]] ? Input : never
type RouteResult<Call extends RouteCall> = ReturnType<Call>
type FullKey<Key extends readonly string[], Input> = readonly [...Key, Input]

type QueryKey<Call extends RouteCall, Key extends readonly string[]> = [RouteInput<Call>] extends [never]
  ? () => readonly [...Key]
  : {
      (): readonly [...Key]
      (input: RouteInput<Call>): FullKey<Key, RouteInput<Call>>
    }

type QueryOptions<Call extends RouteCall, Key extends readonly string[]> = [RouteInput<Call>] extends [never]
  ? () => {
      readonly queryKey: readonly [...Key]
      readonly queryFn: (context?: TanStackQueryFunctionContext) => RouteResult<Call>
    }
  : (input: RouteInput<Call>) => {
      readonly queryKey: FullKey<Key, RouteInput<Call>>
      readonly queryFn: (context?: TanStackQueryFunctionContext) => RouteResult<Call>
    }

type MutationOptions<Call extends RouteCall, Key extends readonly string[]> = [RouteInput<Call>] extends [never]
  ? () => {
      readonly mutationKey: readonly [...Key]
      readonly mutationFn: () => RouteResult<Call>
    }
  : {
      (): {
        readonly mutationKey: readonly [...Key]
        readonly mutationFn: (input: RouteInput<Call>) => RouteResult<Call>
      }
      (input: RouteInput<Call>): {
        readonly mutationKey: FullKey<Key, RouteInput<Call>>
        readonly mutationFn: () => RouteResult<Call>
      }
    }

export type TanStackQueryRoute<Call extends RouteCall, Key extends readonly string[]> = {
  readonly queryKey: QueryKey<Call, Key>
  readonly queryOptions: QueryOptions<Call, Key>
  readonly mutationOptions: MutationOptions<Call, Key>
}

export type TanStackQueryClient<Client extends object, Prefix extends readonly string[] = readonly []> = {
  readonly queryKey: () => readonly [...Prefix]
} & {
  readonly [Key in keyof Client]: Client[Key] extends RouteCall
    ? TanStackQueryRoute<Client[Key], readonly [...Prefix, Key & string]>
    : Client[Key] extends object
      ? TanStackQueryClient<Client[Key], readonly [...Prefix, Key & string]>
      : never
}

function keyWithInput(key: readonly string[], args: readonly unknown[]): readonly unknown[] {
  return args.length === 0 ? [...key] : [...key, args[0]]
}

function routeIntegration(call: (...args: readonly unknown[]) => Promise<unknown>, key: readonly string[]) {
  const integration = clientRouteIntegration(call)
  if (integration === undefined)
    throw new TypeError(`TanStack Query route "${key.join('.')}" is not an @hulla/api client call`)

  const queryKey = (...args: readonly unknown[]) => keyWithInput(key, args)
  const queryOptions = (...args: readonly unknown[]) => {
    if (integration.hasInput && args.length === 0) {
      throw new TypeError('queryOptions() requires the route input so its query can be executed deterministically.')
    }
    return {
      queryKey: queryKey(...args),
      queryFn: (context?: TanStackQueryFunctionContext) =>
        integration.hasInput ? call(args[0], { signal: context?.signal }) : call({ signal: context?.signal }),
    }
  }
  const mutationOptions = (...args: readonly unknown[]) =>
    integration.hasInput && args.length === 0
      ? { mutationKey: [...key], mutationFn: (input: unknown) => call(input) }
      : {
          mutationKey: queryKey(...args),
          mutationFn: () => (integration.hasInput ? call(args[0]) : call()),
        }

  return { queryKey, queryOptions, mutationOptions }
}

function integrationTree(value: object, key: readonly string[]): Record<string, unknown> {
  const result: Record<string, unknown> = { queryKey: () => [...key] }
  for (const [name, child] of Object.entries(value)) {
    const childKey = [...key, name]
    Object.defineProperty(result, name, {
      enumerable: true,
      value:
        typeof child === 'function'
          ? routeIntegration(child as (...args: readonly unknown[]) => Promise<unknown>, childKey)
          : typeof child === 'object' && child !== null
            ? integrationTree(child, childKey)
            : undefined,
    })
  }
  return result
}

/** Creates a parallel TanStack Query view without extending or copying the client calls. */
export function createTanStackQuery<const Client extends object>(client: Client): TanStackQueryClient<Client> {
  return integrationTree(client, []) as TanStackQueryClient<Client>
}
