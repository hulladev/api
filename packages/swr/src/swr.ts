import { clientRouteIntegration } from '@hulla/api/client'

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
  ? () => readonly [readonly [...Key], () => RouteResult<Call>]
  : (input: RouteInput<Call>) => readonly [FullKey<Key, RouteInput<Call>>, () => RouteResult<Call>]

type MutationOptions<Call extends RouteCall, Key extends readonly string[]> = [RouteInput<Call>] extends [never]
  ? () => readonly [readonly [...Key], () => RouteResult<Call>]
  : {
      (): readonly [readonly [...Key], (input: RouteInput<Call>) => RouteResult<Call>]
      (input: RouteInput<Call>): readonly [FullKey<Key, RouteInput<Call>>, () => RouteResult<Call>]
    }

export type SWRRoute<Call extends RouteCall, Key extends readonly string[]> = {
  readonly queryKey: QueryKey<Call, Key>
  readonly queryOptions: QueryOptions<Call, Key>
  readonly mutationOptions: MutationOptions<Call, Key>
}

export type SWRClient<Client extends object, Prefix extends readonly string[] = readonly []> = {
  readonly queryKey: () => readonly [...Prefix]
} & {
  readonly [Key in keyof Client]: Client[Key] extends RouteCall
    ? SWRRoute<Client[Key], readonly [...Prefix, Key & string]>
    : Client[Key] extends object
      ? SWRClient<Client[Key], readonly [...Prefix, Key & string]>
      : never
}

function keyWithInput(key: readonly string[], args: readonly unknown[]): readonly unknown[] {
  return args.length === 0 ? [...key] : [...key, args[0]]
}

function routeIntegration(call: (...args: readonly unknown[]) => Promise<unknown>, key: readonly string[]) {
  const integration = clientRouteIntegration(call)
  if (integration === undefined) throw new TypeError(`SWR route "${key.join('.')}" is not a Hulla client call`)

  const queryKey = (...args: readonly unknown[]) => keyWithInput(key, args)
  const queryOptions = (...args: readonly unknown[]) => {
    if (integration.hasInput && args.length === 0) {
      throw new TypeError('queryOptions() requires the route input so its query can be executed deterministically.')
    }
    return [queryKey(...args), () => (integration.hasInput ? call(args[0]) : call())] as const
  }
  const mutationOptions = (...args: readonly unknown[]) => {
    if (integration.hasInput && args.length === 0) {
      return [[...key], (input: unknown) => call(input)] as const
    }
    return [queryKey(...args), () => (integration.hasInput ? call(args[0]) : call())] as const
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

/** Creates a parallel SWR view without extending or copying the client calls. */
export function createSWR<const Client extends object>(client: Client): SWRClient<Client> {
  return integrationTree(client, []) as SWRClient<Client>
}
