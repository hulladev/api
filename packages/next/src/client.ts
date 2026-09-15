import { contractNodeKey, type AnyRouter, type Contract, type ContractNodeFor, type Route } from '@hulla/api'
import type { ClientTransport, ClientTransportRequest } from '@hulla/api/client'
import { fetchTransport, type ClientFetch, type FetchTransportOptions } from '@hulla/api/fetch'

export type NextFetchRequestConfig = {
  readonly revalidate?: number | false
  readonly tags?: string[]
}

export type NextFetchCache = 'force-cache' | 'no-store'

export type NextFetchOptions = {
  readonly cache?: NextFetchCache
  readonly next?: NextFetchRequestConfig
}

export type NextFetch = ClientFetch<NextFetchOptions>
export type NextFetchTransportOptions = FetchTransportOptions<NextFetchOptions>
export type NextRouteTagOptions = {
  readonly namespace?: string
}

export type NextFetchPolicyRequest<Key extends readonly string[] = readonly string[]> = ClientTransportRequest & {
  readonly key: Key
  readonly method: 'GET'
}

export type NextFetchPolicy<Key extends readonly string[] = readonly string[]> =
  | NextFetchOptions
  | ((request: NextFetchPolicyRequest<Key>) => NextFetchOptions | undefined)

type StringKey<Value> = Extract<keyof Value, string>

type NextPolicyTree<Value, Prefix extends readonly string[] = readonly []> = {
  readonly [Key in Exclude<StringKey<Value>, '$meta'>]?: Value[Key] extends Route<infer Method>
    ? Method extends 'GET'
      ? NextFetchPolicy<readonly [...Prefix, Key]>
      : never
    : Value[Key] extends AnyRouter
      ? NextPolicyTree<Value[Key], readonly [...Prefix, Key]>
      : never
}

export type NextRoutePolicies<ContractType extends Contract> = NextPolicyTree<ContractType['routes']>

export type CreateNextCacheOptions<ContractType extends Contract> = NextRouteTagOptions & {
  readonly routes?: NextRoutePolicies<ContractType>
}

export type NextCacheTransportOptions = Omit<NextFetchTransportOptions, 'fetchOptions'>

export type NextCache<ContractType extends Contract> = {
  /** Creates a tag for a node belonging to this contract. */
  readonly tag: <const Node extends ContractNodeFor<ContractType>>(node: Node) => string
  /** Creates root-to-node prefix tags for a node belonging to this contract. */
  readonly tags: <const Node extends ContractNodeFor<ContractType>>(node: Node) => readonly string[]
  /** Adds this cache's namespace and structural tags to explicit Next.js fetch options. */
  readonly fetchOptions: (request: Pick<ClientTransportRequest, 'key'>, options?: NextFetchOptions) => NextFetchOptions
  /** Creates a transport driven by the contract-shaped GET route policies. */
  readonly fetchTransport: (options?: NextCacheTransportOptions) => ClientTransport
}

const defaultTagNamespace = 'hulla-api'
const maximumTagLength = 256
const maximumTags = 128

function encodedTagSegment(segment: string): string {
  return encodeURIComponent(segment)
}

function assertTag(tag: string): string {
  if (tag.length > maximumTagLength) {
    throw new TypeError(`Next.js cache tag exceeds ${maximumTagLength} characters: ${tag}`)
  }
  return tag
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

type CompiledNextFetchPolicy = {
  readonly policy: NextFetchPolicy
  readonly tags: readonly string[]
}

function compilePolicies(
  contract: Contract,
  definitions: Readonly<Record<string, unknown>>,
  configured: Readonly<Record<string, unknown>> | undefined,
  policies: Map<readonly string[], CompiledNextFetchPolicy>,
  tagOptions: NextRouteTagOptions,
  prefix: readonly string[] = []
): void {
  if (configured === undefined) return
  for (const [name, policy] of Object.entries(configured)) {
    if (!Object.hasOwn(definitions, name)) {
      throw new TypeError(`Next.js cache policy route "${[...prefix, name].join('.')}" is not in the contract`)
    }
    const definition = definitions[name]
    const key = [...prefix, name]
    if (!isRecord(definition)) {
      throw new TypeError(`Next.js cache policy route "${key.join('.')}" is invalid`)
    }
    if (definition['kind'] === 'route') {
      if (definition['method'] !== 'GET') {
        throw new TypeError(
          `Next.js cache policies support only GET routes; "${key.join('.')}" is ${definition['method']}`
        )
      }
      if (typeof policy !== 'function' && !isRecord(policy)) {
        throw new TypeError(`Next.js cache policy for "${key.join('.')}" must be an object or function`)
      }
      const canonicalKey = contractNodeKey(contract, definition as never)
      policies.set(canonicalKey, {
        policy: policy as NextFetchPolicy,
        tags: nextRouteTags(canonicalKey, tagOptions),
      })
      continue
    }
    if (!isRecord(policy)) {
      throw new TypeError(`Next.js cache policy router "${key.join('.')}" must be an object`)
    }
    compilePolicies(contract, definition, policy, policies, tagOptions, key)
  }
}

/** Returns the stable tag for one contract route or router key. */
export function nextRouteTag(key: readonly string[], options: NextRouteTagOptions = {}): string {
  const namespace = options.namespace ?? defaultTagNamespace
  if (namespace.length === 0) throw new TypeError('Next.js cache tag namespace must not be empty')
  const encodedNamespace = encodedTagSegment(namespace)
  return assertTag(key.length === 0 ? encodedNamespace : `${encodedNamespace}:${key.map(encodedTagSegment).join(':')}`)
}

/** Returns root-to-leaf tags so a route can be invalidated at any contract router boundary. */
export function nextRouteTags(key: readonly string[], options: NextRouteTagOptions = {}): readonly string[] {
  if (key.length + 1 > maximumTags) {
    throw new TypeError(`Next.js supports at most ${maximumTags} cache tags per request`)
  }
  const tags = [nextRouteTag([], options)]
  for (let index = 1; index <= key.length; index++) tags.push(nextRouteTag(key.slice(0, index), options))
  return tags
}

/** Adds structural contract tags to native Next.js fetch options. */
export function nextFetchOptions(
  request: Pick<ClientTransportRequest, 'key'>,
  options: NextFetchOptions = {},
  tagOptions: NextRouteTagOptions = {}
): NextFetchOptions {
  return mergeNextFetchOptions(nextRouteTags(request.key, tagOptions), options)
}

function mergeNextFetchOptions(structuralTags: readonly string[], options: NextFetchOptions): NextFetchOptions {
  const tags = [...new Set([...structuralTags, ...(options.next?.tags ?? [])])]
  if (tags.length > maximumTags) {
    throw new TypeError(`Next.js supports at most ${maximumTags} cache tags per request`)
  }
  for (const tag of tags) assertTag(tag)
  return {
    ...options,
    next: {
      ...options.next,
      tags,
    },
  }
}

/** Creates the Fetch transport with typed support for Next.js Data Cache options. */
export function nextFetchTransport(options: NextFetchTransportOptions = {}) {
  return fetchTransport<NextFetchOptions>(options)
}

/** Creates contract-bound cache tags, GET policies, and a Next.js Fetch transport. */
export function createNextCache<const ContractType extends Contract>(
  contract: ContractType,
  options: CreateNextCacheOptions<ContractType> = {}
): NextCache<ContractType> {
  const tagOptions: NextRouteTagOptions = options.namespace === undefined ? {} : { namespace: options.namespace }
  const policies = new Map<readonly string[], CompiledNextFetchPolicy>()
  compilePolicies(
    contract,
    contract.routes,
    options.routes as Readonly<Record<string, unknown>> | undefined,
    policies,
    tagOptions
  )

  const configuredFetchOptions = (request: ClientTransportRequest): NextFetchOptions | undefined => {
    const compiled = policies.get(request.key)
    if (compiled === undefined) return undefined
    const configured =
      typeof compiled.policy === 'function' ? compiled.policy(request as NextFetchPolicyRequest) : compiled.policy
    return configured === undefined ? undefined : mergeNextFetchOptions(compiled.tags, configured)
  }

  return {
    tag: (node: ContractNodeFor<ContractType>) => nextRouteTag(contractNodeKey(contract, node), tagOptions),
    tags: (node: ContractNodeFor<ContractType>) => nextRouteTags(contractNodeKey(contract, node), tagOptions),
    fetchOptions: (request: Pick<ClientTransportRequest, 'key'>, fetchOptions: NextFetchOptions = {}) =>
      nextFetchOptions(request, fetchOptions, tagOptions),
    fetchTransport: (transportOptions: NextCacheTransportOptions = {}) =>
      nextFetchTransport({ ...transportOptions, fetchOptions: configuredFetchOptions }),
  } as NextCache<ContractType>
}
