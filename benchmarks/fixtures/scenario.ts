import { z } from 'zod'

/** Shared validated workloads consumed by every benchmark implementation. */

export const benchmarkScenarios = {
  'path-parameter-read': 'Read one resource through two path parameters',
  'query-header-read': 'Filtered collection read with a path parameter, scalar and repeated query values, and a header',
  'mixed-update': 'JSON update with path parameters, query, headers, and validated response',
  'static-get': 'Static JSON GET with server and client output validation',
  'small-json-post': "Small JSON POST with each runtime's request and response validation",
  'large-json-post': "Large JSON POST with each runtime's request and response validation",
  'cold-first-call': 'Loaded-module application construction plus the first validated request',
  'wire-dispatch': 'Server adapter dispatch with a host-parsed JSON body',
  'large-static-dispatch': 'Static route dispatch through a 256-route server',
  'large-dynamic-dispatch': 'Parameterized route dispatch through a 256-route server',
  'server-implementation-setup': 'Server implementation construction plus Fetch handler creation',
  'server-implementation-dispatch': 'Hot dispatch through complete implementations and implementation fragments',
  'adapter-registration': 'Per-route Express registration of a 257-route REST implementation',
  'adapter-static-dispatch': 'Express adapter static dispatch with 256 routes or procedures',
  'adapter-dynamic-dispatch': 'Express adapter validated dynamic dispatch using each package’s native protocol',
  'express-http-static-roundtrip': 'Real in-process HTTP GET through the Express router and adapter',
  'express-http-dynamic-roundtrip': 'Real in-process HTTP update through the Express router and adapter',
  'fetch-adapter-static-dispatch': 'Fetch adapter static dispatch using each package’s native protocol',
  'fetch-adapter-dynamic-dispatch': 'Fetch adapter validated dynamic dispatch using each package’s native protocol',
  'next-adapter-static-dispatch': 'Next.js Route Handler static dispatch',
  'next-adapter-dynamic-dispatch': 'Next.js Route Handler validated dynamic dispatch',
  'tanstack-start-adapter-static-dispatch': 'TanStack Start server-route static dispatch',
  'tanstack-start-adapter-dynamic-dispatch': 'TanStack Start server-route validated dynamic dispatch',
  'dynamic-http': 'Dynamic path, query, and header transport with directional validation',
  'middleware-context': 'Client and server context plus one middleware layer',
  'validation-failure': 'Invalid server request validation and protocol error serialization',
  'codec-roundtrip': 'Bidirectional Date codec across client and server HTTP boundaries',
  streaming: 'Ten NDJSON chunks with server and client schema validation',
} as const

export type BenchmarkScenario = keyof typeof benchmarkScenarios

/** A concrete sketch of the work represented by each report row. */
export const benchmarkScenarioExamples: Readonly<Record<BenchmarkScenario, string>> = {
  'path-parameter-read': 'GET /organizations/org-engineering/users/user-42',
  'query-header-read':
    'GET /organizations/org-engineering/users?cursor=next-page&limit=25&role=admin&role=member\nx-tenant-token: tenant-secret',
  'mixed-update':
    'PATCH /organizations/org-engineering/users/user-42?notify=true\nx-tenant-token: tenant-secret\n\n{ "active": true, "displayName": "Ada Lovelace" }',
  'static-get': 'GET /health\n\nvalidate { "ok": true }',
  'small-json-post': 'POST /users\n\n{ "name": "Ada" } → validate { "id": "user-1", "name": "Ada" }',
  'large-json-post': 'POST /large\n\n{ "items": [100 items] } → validate { "count": 100, "items": [100 items] }',
  'cold-first-call': 'build contract/router + server adapter + client\nawait client.health()',
  'wire-dispatch':
    'adapter.dispatch({ method: "POST", path: "/execute", body: { value: 21 } }) // body already parsed by host',
  'large-static-dispatch': 'adapter.dispatch({ method: "GET", path: "/static/255" }) // 256 registered routes',
  'large-dynamic-dispatch':
    'adapter.dispatch({ method: "GET", path: "/dynamic/255/item%2F42" }) // 256 registered routes',
  'server-implementation-setup': 'const handler = createFetchHandler(server.implement(...fragments))',
  'server-implementation-dispatch':
    'await handler(new Request("https://bench.local/implementation/3")) // reuse a prebuilt implementation',
  'adapter-registration': 'register 257 REST routes on an Express router',
  'adapter-static-dispatch':
    'invoke captured Express handler\nREST example: GET /adapter/255\nRPC packages: equivalent native static procedure',
  'adapter-dynamic-dispatch':
    'invoke captured Express handler\nREST example: POST /adapter/items/item-42?tag=bench with { "name": "Ada" }\nRPC packages: equivalent native dynamic procedure',
  'express-http-static-roundtrip':
    'await fetch("http://127.0.0.1:<port>/<native-static-endpoint>") // REST example: /adapter/255',
  'express-http-dynamic-roundtrip':
    'await fetch("http://127.0.0.1:<port>/<native-dynamic-endpoint>", requestInit)\n// id: item-42, name: Ada, tag: bench',
  'fetch-adapter-static-dispatch':
    'await fetchHandler(new Request("https://bench.local/<native-static-endpoint>"))\n// REST example: /adapter/static',
  'fetch-adapter-dynamic-dispatch':
    'await fetchHandler(new Request("https://bench.local/<native-dynamic-endpoint>", requestInit))\n// id: item-42, name: Ada, tag: bench',
  'next-adapter-static-dispatch':
    'await nextRouteHandler(new NextRequest("https://bench.local/adapter/static"), routeContext)',
  'next-adapter-dynamic-dispatch':
    'await nextRouteHandler(new NextRequest("https://bench.local/adapter/items/item-42?tag=bench", requestInit), routeContext)',
  'tanstack-start-adapter-static-dispatch':
    'await startHandlers.GET({ request, params: { _splat: "adapter/static" }, context })',
  'tanstack-start-adapter-dynamic-dispatch':
    'await startHandlers.POST({ request, params: { _splat: "adapter/items/item-42" }, context })',
  'dynamic-http':
    'GET /items/item%2F42?limit=10\nx-token: secret\n\nvalidate path, query, and header in both directions',
  'middleware-context': 'GET /protected\n\nclient middleware → transport → server context + middleware → handler',
  'validation-failure': 'POST /failure\n\n{ "count": -1 } → serialized request-validation error',
  'codec-roundtrip': 'POST /codec\n\nDate → ISO string over HTTP → Date',
  streaming: 'GET /events\n\nserver yields 10 values → NDJSON stream → client validates 10 values',
}

export type BenchmarkAdapter = 'express' | 'fetch' | 'next' | 'none' | 'tanstack-start'
export type BenchmarkFunctionality =
  | 'codec'
  | 'construction-first-call'
  | 'implementation-dispatch'
  | 'implementation-setup'
  | 'json-write'
  | 'large-json-write'
  | 'middleware-context'
  | 'mixed-request'
  | 'path-read'
  | 'query-header-read'
  | 'route-registration'
  | 'static-read'
  | 'streaming'
  | 'validation-error'
export type BenchmarkPhase = 'construction' | 'dispatch' | 'registration' | 'roundtrip'
export type BenchmarkSuite = 'adapter' | 'application' | 'authoring' | 'diagnostic'

export type BenchmarkScenarioDimensions = {
  readonly adapter: BenchmarkAdapter
  readonly functionality: BenchmarkFunctionality
  readonly phase: BenchmarkPhase
  readonly suite: BenchmarkSuite
}

/** Stable query dimensions for reports and historical analysis. */
export const benchmarkScenarioDimensions: Readonly<Record<BenchmarkScenario, BenchmarkScenarioDimensions>> = {
  'path-parameter-read': {
    adapter: 'fetch',
    functionality: 'path-read',
    phase: 'roundtrip',
    suite: 'application',
  },
  'query-header-read': {
    adapter: 'fetch',
    functionality: 'query-header-read',
    phase: 'roundtrip',
    suite: 'application',
  },
  'mixed-update': {
    adapter: 'fetch',
    functionality: 'mixed-request',
    phase: 'roundtrip',
    suite: 'application',
  },
  'static-get': {
    adapter: 'fetch',
    functionality: 'static-read',
    phase: 'roundtrip',
    suite: 'application',
  },
  'small-json-post': {
    adapter: 'fetch',
    functionality: 'json-write',
    phase: 'roundtrip',
    suite: 'application',
  },
  'large-json-post': {
    adapter: 'fetch',
    functionality: 'large-json-write',
    phase: 'roundtrip',
    suite: 'application',
  },
  'cold-first-call': {
    adapter: 'fetch',
    functionality: 'construction-first-call',
    phase: 'construction',
    suite: 'authoring',
  },
  'wire-dispatch': {
    adapter: 'fetch',
    functionality: 'mixed-request',
    phase: 'dispatch',
    suite: 'diagnostic',
  },
  'large-static-dispatch': {
    adapter: 'fetch',
    functionality: 'static-read',
    phase: 'dispatch',
    suite: 'diagnostic',
  },
  'large-dynamic-dispatch': {
    adapter: 'fetch',
    functionality: 'mixed-request',
    phase: 'dispatch',
    suite: 'diagnostic',
  },
  'server-implementation-setup': {
    adapter: 'fetch',
    functionality: 'implementation-setup',
    phase: 'construction',
    suite: 'authoring',
  },
  'server-implementation-dispatch': {
    adapter: 'fetch',
    functionality: 'implementation-dispatch',
    phase: 'dispatch',
    suite: 'diagnostic',
  },
  'adapter-registration': {
    adapter: 'express',
    functionality: 'route-registration',
    phase: 'registration',
    suite: 'adapter',
  },
  'adapter-static-dispatch': {
    adapter: 'express',
    functionality: 'static-read',
    phase: 'dispatch',
    suite: 'adapter',
  },
  'adapter-dynamic-dispatch': {
    adapter: 'express',
    functionality: 'mixed-request',
    phase: 'dispatch',
    suite: 'adapter',
  },
  'express-http-static-roundtrip': {
    adapter: 'express',
    functionality: 'static-read',
    phase: 'roundtrip',
    suite: 'adapter',
  },
  'express-http-dynamic-roundtrip': {
    adapter: 'express',
    functionality: 'mixed-request',
    phase: 'roundtrip',
    suite: 'adapter',
  },
  'fetch-adapter-static-dispatch': {
    adapter: 'fetch',
    functionality: 'static-read',
    phase: 'dispatch',
    suite: 'adapter',
  },
  'fetch-adapter-dynamic-dispatch': {
    adapter: 'fetch',
    functionality: 'mixed-request',
    phase: 'dispatch',
    suite: 'adapter',
  },
  'next-adapter-static-dispatch': {
    adapter: 'next',
    functionality: 'static-read',
    phase: 'dispatch',
    suite: 'adapter',
  },
  'next-adapter-dynamic-dispatch': {
    adapter: 'next',
    functionality: 'mixed-request',
    phase: 'dispatch',
    suite: 'adapter',
  },
  'tanstack-start-adapter-static-dispatch': {
    adapter: 'tanstack-start',
    functionality: 'static-read',
    phase: 'dispatch',
    suite: 'adapter',
  },
  'tanstack-start-adapter-dynamic-dispatch': {
    adapter: 'tanstack-start',
    functionality: 'mixed-request',
    phase: 'dispatch',
    suite: 'adapter',
  },
  'dynamic-http': {
    adapter: 'fetch',
    functionality: 'query-header-read',
    phase: 'roundtrip',
    suite: 'diagnostic',
  },
  'middleware-context': {
    adapter: 'fetch',
    functionality: 'middleware-context',
    phase: 'roundtrip',
    suite: 'diagnostic',
  },
  'validation-failure': {
    adapter: 'fetch',
    functionality: 'validation-error',
    phase: 'roundtrip',
    suite: 'diagnostic',
  },
  'codec-roundtrip': {
    adapter: 'fetch',
    functionality: 'codec',
    phase: 'roundtrip',
    suite: 'diagnostic',
  },
  streaming: {
    adapter: 'fetch',
    functionality: 'streaming',
    phase: 'roundtrip',
    suite: 'diagnostic',
  },
}

/** Shared wire schemas and values used by every implementation. */
export const healthOutput = z.object({ ok: z.boolean() })
export const healthValue = { ok: true }
export const createUserInput = z.object({ name: z.string().min(1) })
export const createUserOutput = z.object({ id: z.string(), name: z.string() })
export const createUserValue = { name: 'Ada' }
export const createdUserValue = { id: 'user-1', name: 'Ada' }
const largeItem = z.object({ id: z.number().int(), label: z.string(), active: z.boolean() })
export const largeInput = z.object({ items: z.array(largeItem) })
export const largeOutput = z.object({ count: z.number().int(), items: z.array(largeItem) })
export const largeValue = {
  items: Array.from({ length: 100 }, (_, id) => ({ id, label: `item-${id}`, active: id % 2 === 0 })),
}
export const largeResult = { count: largeValue.items.length, items: largeValue.items }

export const resourceParams = z.object({ organizationId: z.string().min(1), userId: z.string().min(1) })
export const organizationParams = z.object({ organizationId: z.string().min(1) })
export const resourceQuery = z.object({
  cursor: z.string().min(1),
  limit: z.string().regex(/^\d+$/),
  role: z.array(z.enum(['admin', 'member'])).min(1),
})
export const resourceHeaders = z.object({ 'x-tenant-token': z.string().min(1) })
export const updateQuery = z.object({ notify: z.enum(['true', 'false']) })
export const updateBody = z.object({ active: z.boolean(), displayName: z.string().min(1) })
export const resourceOutput = z.object({
  active: z.boolean(),
  displayName: z.string(),
  organizationId: z.string(),
  userId: z.string(),
})
export const collectionOutput = z.object({
  cursor: z.string(),
  limit: z.number().int(),
  organizationId: z.string(),
  roles: z.array(z.string()),
  token: z.string(),
})
export const resourceValue = { organizationId: 'org-engineering', userId: 'user-42' }
export const queryValue: z.input<typeof resourceQuery> = {
  cursor: 'next-page',
  limit: '25',
  role: ['admin', 'member'] as ('admin' | 'member')[],
}
export const headerValue = { 'x-tenant-token': 'tenant-secret' }
export const updateQueryValue = { notify: 'true' as const }
export const updateBodyValue = { active: true, displayName: 'Ada Lovelace' }
export const resourceResult = { ...resourceValue, ...updateBodyValue }
export const collectionResult = {
  organizationId: resourceValue.organizationId,
  cursor: queryValue.cursor,
  limit: Number(queryValue.limit),
  roles: [...queryValue.role],
  token: headerValue['x-tenant-token'],
}

/** Validates an identity schema at an inbound boundary. */
export function encodeValue<const Schema extends z.ZodType>(schema: Schema, value: z.output<Schema>): z.input<Schema> {
  return schema.parse(value) as z.input<Schema>
}

export function assertHealth(value: unknown): void {
  if (!healthOutput.parse(value).ok) throw new Error('Unexpected health result')
}

export function assertCreatedUser(value: unknown): void {
  const result = createUserOutput.parse(value)
  if (result.id !== 'user-1' || result.name !== 'Ada') throw new Error('Unexpected benchmark result')
}

export function assertLarge(value: unknown): void {
  const result = largeOutput.parse(value)
  if (result.count !== largeValue.items.length || result.items[99]?.id !== 99) {
    throw new Error('Unexpected large benchmark result')
  }
}

export function assertResource(value: unknown): void {
  const result = resourceOutput.parse(value)
  if (result.organizationId !== resourceValue.organizationId || result.userId !== resourceValue.userId) {
    throw new Error('Unexpected resource benchmark result')
  }
}

export function assertCollection(value: unknown): void {
  const result = collectionOutput.parse(value)
  if (result.organizationId !== resourceValue.organizationId || result.roles.length !== queryValue.role.length) {
    throw new Error('Unexpected collection benchmark result')
  }
}
