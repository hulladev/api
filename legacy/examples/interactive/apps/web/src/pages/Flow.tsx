import { createApi } from '@hulla/api'
import { useLiveQuery } from '@tanstack/react-db'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type ReactNode, type Ref } from 'react'
import { z } from 'zod'
import { client, queryClient, taskCollection } from '../api/client'
import { setDemoLatency } from '../api/runtime'
import { Code } from '../components/Code'
import type { TaskView } from '../components/TaskList'
import { TransportInspector } from '../components/TransportInspector'
import { Workspace, type LessonFile, type LessonFocus } from '../components/Workspace'

type GuidePoint = {
  label: string
  detail: string
  focus: LessonFocus
}

const codeProsePattern =
  /(@[\w/-]+|\b[\w/-]+\.(?:ts|tsx|json)\b|\.[a-zA-Z]\w*(?:\([^)]*\))?|\b[A-Z][a-zA-Z]*\[\]|\b(?:mutate|route|router|useQuery|useMutation)\([^)]*\))/g

function CodeProse({ children }: { children: string }) {
  return children.split(codeProsePattern).map((part, index) =>
    index % 2 === 1 ? (
      <code className="inline-code" key={`${part}-${index}`}>
        {part}
      </code>
    ) : (
      part
    )
  )
}

type PlaygroundMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE'
type PlaygroundRoute = {
  name: string
  method: PlaygroundMethod
  path: string
  output: string
}

const taskRouterCode = `import { createApi } from '@hulla/api'
import { z } from 'zod'

const newTask = z.object({
  title: z.string().trim().min(2),
  priority: z.enum(['low', 'medium', 'high']),
})

const api = createApi()
const storedTasks = new Map<string, z.infer<typeof newTask> & { id: string }>()

export const tasks = api.router('tasks').define(({ procedure }) => ({
  create: procedure.input(newTask).handler(({ input }) => {
    const task = { id: crypto.randomUUID(), ...input }
    storedTasks.set(task.id, task)
    return task
  }),

  isUrgent: procedure
    .input(z.string())
    .handler(({ input: id }) => storedTasks.get(id)?.priority === 'high'),
}))`

const taskProcedureCode = `${taskRouterCode}

const task = tasks.create({
  title: 'Ship the demo',
  priority: 'high', // Try "urgent" — TypeScript catches it here.
})
tasks.isUrgent(task.id)
`

const authCode = `export type Session = {
  user: { id: string; name: string; role: 'member' | 'admin' }
}

export async function getSession(): Promise<Session> {
  // Demo endpoint standing in for Clerk, Auth0, or your own session API.
  const response = await fetch('/demo-api/session')
  if (!response.ok) throw new Error('Sign in required')
  return response.json() as Promise<Session>
}

export async function requireAdmin() {
  const session = await getSession()
  if (session.user.role !== 'admin') throw new Error('Admin access required')
  return { canDeleteAnyTask: true as const }
}`

const middlewareCode = `import { createApi } from '@hulla/api'
import { z } from 'zod'
import { getSession, requireAdmin } from './auth'

const api = createApi({
  middleware: {
    session: getSession,
    admin: requireAdmin,
  },
})

export const tasks = api
  .router('tasks')
  // Router middleware: every task procedure requires a signed-in user.
  .use('session')
  .define(({ procedure }) => ({
    listMine: procedure.handler(async ({ getContext }) => {
      const { session } = await getContext() // router middleware context
      const response = await fetch(\`/api/users/\${session.user.id}/tasks\`)
      return response.json()
    }),

    // Procedure middleware: only this destructive action requires an admin.
    deleteAny: procedure
      .use('admin')
      .input(z.string())
      .handler(async ({ input, getContext }) => {
        const { session, admin } = await getContext() // router + procedure context
        if (admin.canDeleteAnyTask) {
          return fetch(\`/api/tasks/\${input}\`, {
            method: 'DELETE',
            headers: { 'x-user-id': session.user.id },
          })
        }
      }),
  }))`

const openApiDocumentCode = `{
  "openapi": "3.1.0",
  "info": { "title": "Acme Tasks", "version": "1.0.0" },
  "servers": [{ "url": "https://api.acme.dev" }],
  "paths": {
    "/tasks": {
      "get": {
        "operationId": "tasks.list",
        "responses": {
          "200": {
            "description": "Task list",
            "content": {
              "application/json": {
                "schema": {
                  "type": "array",
                  "items": { "$ref": "#/components/schemas/Task" }
                }
              }
            }
          }
        }
      }
    }
  },
  "components": {
    "schemas": {
      "Task": {
        "type": "object",
        "required": ["id", "title", "status"],
        "properties": {
          "id": { "type": "string" },
          "title": { "type": "string" },
          "status": { "enum": ["backlog", "active", "done"] }
        }
      }
    }
  }
}`

const openApiConfigCode = `import { generate } from '@hulla/api'
import { openapi } from '@hulla/api-openapi'

export default generate({
  sources: [
    openapi({
      name: 'acme',
      input: './openapi/acme.json',
      baseUrl: 'https://api.acme.dev',
    }),
  ],
  output: {
    dir: './src',
    entry: './src/api.ts',
  },
})`

const openApiClientCode = `import { createOpenAPIClient } from './acme.generated'

export const acme = createOpenAPIClient(async (request) => {
  const response = await fetch(\`https://api.acme.dev\${request.path}\`, {
    method: request.method,
    headers: { ...request.headers, authorization: getToken() },
    body: request.body ? JSON.stringify(request.body) : undefined,
  })

  return response.json()
})

const tasks = await acme.tasks.list()
tasks[0].status // "backlog" | "active" | "done"

function getToken() {
  return 'Bearer demo-token'
}`

const openApiGeneratedCode = `import { createApi } from '@hulla/api'
import { z } from 'zod'

const api = createApi()
const TaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.enum(['backlog', 'active', 'done']),
})

export function createOpenAPIClient(fetcher: OpenAPIClient) {
  return {
    tasks: api.router('tasks').define(({ procedure }) => ({
      list: procedure
        .output(z.array(TaskSchema))
        .handler(() => fetcher<z.input<typeof TaskSchema>[]>({ method: 'GET', path: '/tasks' })),
    })),
  }
}

type OpenAPIClient = <Result>(request: {
  path: string
  method: string
  headers?: Record<string, string>
  body?: unknown
}) => Result | Promise<Result>`

const backendRouteCode = `import { createApi } from '@hulla/api'
import { z } from 'zod'

const api = createApi()

const priority = z.enum(['low', 'medium', 'high'])
const task = z.object({
  id: z.string(),
  title: z.string(),
  priority,
  completed: z.boolean(),
  createdAt: z.string(),
})

const db = new Map<string, z.infer<typeof task>>()

export const tasks = api.router('tasks').define(({ route }) => ({
  list: route('GET', '/').output(z.array(task))
    .handler(() => [...db.values()]),

  create: route('POST', '/')
    .input(z.object({ title: z.string().trim().min(2), priority }))
    .output(task)
    .handler(({ input }) => {
      const created = {
        ...input,
        id: crypto.randomUUID(),
        completed: false,
        createdAt: new Date().toISOString(),
      }
      db.set(created.id, created)
      return created
    }),

  update: route('PATCH', '/:id')
    .input(
      z.string(),
      z.object({
        title: z.string().trim().min(2).optional(),
        priority: priority.optional(),
        completed: z.boolean().optional(),
      }),
    )
    .output(task)
    .handler(({ input: [id, changes] }) => {
      const current = db.get(id)
      if (!current) throw new Error('Task not found')
      const updated = { ...current, ...changes }
      db.set(id, updated)
      return updated
    }),

  delete: route('DELETE', '/:id')
    .input(z.string())
    .output(task)
    .handler(({ input: id }) => {
      const current = db.get(id)
      if (!current) throw new Error('Task not found')
      db.delete(id)
      return current
    }),
}))`

const pluginCode = `import { createApi } from '@hulla/api'
import { tanstackQueryPlugin } from '@hulla/api-tanstack-query'
import { z } from 'zod'

const api = createApi({
  // TanStack Query is one example; many other plugins are available.
  plugins: [tanstackQueryPlugin()],
})

export const tasks = api.router('tasks').define(({ procedure }) => ({
  list: procedure.handler(async () => {
    const response = await fetch('/api/tasks')
    return response.json() as Promise<Array<{ id: string; title: string }>>
  }),
  byId: procedure.input(z.string()).handler(async ({ input: id }) => {
    const response = await fetch(\`/api/tasks/\${id}\`)
    return response.json() as Promise<{ id: string; title: string }>
  }),
  create: procedure.input(z.object({ title: z.string() })).handler(async ({ input }) => {
    const response = await fetch('/api/tasks', {
      method: 'POST',
      body: JSON.stringify(input),
    })
    return response.json() as Promise<{ id: string; title: string }>
  }),
}))`

const pluginTanstackCode = `import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { tasks } from './api'

export function App({ taskId }: { taskId: string }) {
  const queryClient = useQueryClient()

  // Keys come from the procedure, so they stay typed and consistent across files.
  const listOptions = tasks.list.$tanstack.queryOptions()
  const list = useQuery(listOptions)

  // Procedure input is part of the key: TypeScript requires the task id here.
  const task = useQuery(tasks.byId.$tanstack.queryOptions(taskId))

  // Leave this unbound so mutate(...) supplies the validated input later.
  const create = useMutation({
    ...tasks.create.$tanstack.mutationOptions(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: listOptions.queryKey }),
  })

  // Later, in an event handler: create.mutate({ title: 'Ship it' })
  return task.data?.title ?? \`\${list.data?.length ?? 0} tasks\`
}`

const generationCode = `import { generate } from '@hulla/api'
import { zodWireSchemaConverter } from '@hulla/api/zod'

export default generate({
  routers: { dir: './apps/backend/src/api' },
  schemaConverters: [zodWireSchemaConverter()],
  output: {
    dir: './apps/web/src/api/generated',
  },
})`

const generatedCallCode = `import { client } from './api/client'

const tasks = await client.tasks.list()
tasks[0].priority // "low" | "medium" | "high"

await client.tasks.create({
  title: 'Ship the demo',
  priority: 'high',
})`

const cacheCode = `import { useQuery } from '@tanstack/react-query'
import { client } from './api/client'

export function Tasks() {
  const tasks = useQuery(client.tasks.list.$tanstack.queryOptions())

  if (tasks.isPending) return 'Loading…'
  return tasks.data?.map((task) => task.title) ?? []
}`

const collectionCode = `import { QueryClient } from '@tanstack/react-query'
import { createClient } from './api/generated'

export const queryClient = new QueryClient()

export const client = createClient({
  queryClient,
  collections: {
    tasks: {
      refetch: true,
    },
  },
})

export const tasks = client.tasks.$tanstack.collection

export function completeTask(id: string) {
  const transaction = tasks.update(id, (draft) => {
    draft.completed = true
  })

  return transaction.isPersisted.promise
}`

const generatedRoutesSource = `import { createApi } from '@hulla/api'
import type { HTTPWireInput, HTTPWireOutput } from '@hulla/api'
import { clientSchema } from '@hulla/api/client'
import { tanstackDbPlugin } from '@hulla/api-tanstack-db'
import { tanstackQueryPlugin } from '@hulla/api-tanstack-query'
import { httpContract } from './routes.contract'

type Routes = typeof httpContract.routes.tasks
type TaskList = HTTPWireOutput<Routes['list']['output']>
type CreateInput = HTTPWireInput<Routes['create']['input']['wire']>
type CreatedTask = HTTPWireOutput<Routes['create']['output']>
type UpdateId = HTTPWireInput<Routes['update']['input']['items'][0]>
type UpdateInput = HTTPWireInput<Routes['update']['input']['items'][1]>
type UpdatedTask = HTTPWireOutput<Routes['update']['output']>
type DeleteInput = HTTPWireInput<Routes['delete']['input']['wire']>
type DeletedTask = HTTPWireOutput<Routes['delete']['output']>

export function createRoutesClient() {
  const api = createApi({
    plugins: [
      tanstackQueryPlugin(),
      tanstackDbPlugin({ collections: { tasks: 'id' } }),
    ],
  })

  return api.router('tasks').define(({ procedure }) => ({
    list: procedure
      .output(clientSchema<TaskList>())
      .handler(() => request<TaskList>('/api/tasks')),
    create: procedure
      .input(clientSchema<CreateInput>())
      .output(clientSchema<CreatedTask>())
      .handler(({ input }) => request<CreatedTask>('/api/tasks', {
        method: 'POST',
        body: JSON.stringify(input),
      })),
    update: procedure
      .input(clientSchema<UpdateId>(), clientSchema<UpdateInput>())
      .output(clientSchema<UpdatedTask>())
      .handler(({ input: [id, changes] }) => request<UpdatedTask>(\`/api/tasks/\${id}\`, {
        method: 'PATCH',
        body: JSON.stringify(changes),
      })),
    delete: procedure
      .input(clientSchema<DeleteInput>())
      .output(clientSchema<DeletedTask>())
      .handler(({ input: id }) => request<DeletedTask>(\`/api/tasks/\${id}\`, {
        method: 'DELETE',
      })),
  }))
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init)
  return response.json() as Promise<T>
}`

const generatedClientCode = `import { createCollection } from '@tanstack/db'
import { createCollectionRuntime, crudCollectionOptions } from '@hulla/api-tanstack-db'
import type { QueryClient } from '@tanstack/react-query'
import { createRoutesClient } from './routes'

function createClientRoutes(options = {}) {
  return {
    tasks: createRoutesClient(options),
  }
}

type ClientRoutes = ReturnType<typeof createClientRoutes>
type Task = Awaited<ReturnType<ClientRoutes['tasks']['list']>>[number]
type CollectionOverrides = {
  mapInsert?: (mutation: { modified: Task }) => Parameters<ClientRoutes['tasks']['create']>[0]
  refetch?: boolean
}

export function createClient(options: {
  queryClient: QueryClient
  collections?: { tasks?: CollectionOverrides }
}) {
  const client = createClientRoutes(options)
  const runtime = createCollectionRuntime({
    tasks: () => {
      const generated = crudCollectionOptions({
        ...options.collections?.tasks,
        routes: client.tasks,
        key: 'id',
        queryClient: options.queryClient,
      })

      return Object.assign(createCollection(generated), {
        create: generated.create,
      })
    },
  })

  return Object.assign(client, {
    tasks: Object.assign(client.tasks, {
      $tanstack: {
        get collection() {
          return runtime.collections.tasks
        },
      },
    }),
    $dispose: runtime.dispose,
  })
}`

const routerFiles: LessonFile[] = [
  {
    path: 'src/api.ts',
    source: taskRouterCode,
    badge: 'your code',
    highlightLines: [12],
    status: 'new',
  },
]
const procedureFiles: LessonFile[] = [
  {
    path: 'src/api.ts',
    source: taskProcedureCode,
    badge: 'your code',
    addedLines: [26],
    status: 'changed',
  },
]
const middlewareFiles: LessonFile[] = [
  {
    path: 'src/api.ts',
    source: middlewareCode,
    badge: 'your code',
    addedLines: [15, 18, 25, 28],
    status: 'changed',
  },
  { path: 'src/auth.ts', source: authCode, badge: 'your code', status: 'new' },
]
const pluginFiles: LessonFile[] = [
  {
    path: 'src/api.ts',
    source: pluginCode,
    badge: 'your code',
    addedLines: [2, 3, 6, 7, 15, 19],
    status: 'changed',
  },
  {
    path: 'src/App.tsx',
    source: pluginTanstackCode,
    badge: 'your code',
    highlightLines: [7, 11, 15, 16, 20],
    status: 'new',
  },
]
const openApiFiles: LessonFile[] = [
  {
    path: 'api.config.ts',
    source: openApiConfigCode,
    badge: 'your code',
    highlightLines: [5, 6],
    status: 'new',
  },
  { path: 'openapi/acme.json', source: openApiDocumentCode, badge: 'contract', status: 'new' },
  {
    path: 'src/api.ts',
    source: openApiClientCode,
    badge: 'your code',
    highlightLines: [3, 13],
    status: 'new',
  },
  {
    path: 'src/acme.generated.ts',
    source: openApiGeneratedCode,
    badge: 'generated',
    highlightLines: [13, 14, 15, 16],
    status: 'new',
  },
]
const backendFiles: LessonFile[] = [
  {
    path: 'apps/backend/src/api/tasks.ts',
    source: backendRouteCode,
    badge: 'your code',
    highlightLines: [17, 18, 21, 22],
    status: 'new',
  },
]
const generationSourceFiles: LessonFile[] = [
  {
    path: 'api.config.ts',
    source: generationCode,
    badge: 'your code',
    addedLines: [5, 8],
    status: 'changed',
  },
  { path: 'apps/backend/src/api/tasks.ts', source: backendRouteCode, badge: 'your code' },
]
const generationOutputFiles: LessonFile[] = [
  {
    path: 'apps/web/src/api/generated/routes.ts',
    source: generatedRoutesSource,
    badge: 'generated',
    status: 'new',
  },
  { path: 'apps/web/src/api/generated/index.ts', source: generatedClientCode, badge: 'generated', status: 'new' },
]
const callFiles: LessonFile[] = [
  {
    path: 'apps/web/src/App.tsx',
    source: generatedCallCode,
    badge: 'your code',
    highlightLines: [3, 6],
    status: 'new',
  },
  { path: 'apps/web/src/api/generated/index.ts', source: generatedClientCode, badge: 'generated' },
  { path: 'apps/web/src/api/generated/routes.ts', source: generatedRoutesSource, badge: 'generated' },
]
const cacheFiles: LessonFile[] = [
  {
    path: 'apps/web/src/App.tsx',
    source: cacheCode,
    badge: 'your code',
    addedLines: [5],
    status: 'changed',
  },
  { path: 'apps/web/src/api/generated/index.ts', source: generatedClientCode, badge: 'generated' },
  { path: 'apps/web/src/api/generated/routes.ts', source: generatedRoutesSource, badge: 'generated' },
]
const collectionFiles: LessonFile[] = [
  {
    path: 'apps/web/src/tasks.db.ts',
    source: collectionCode,
    badge: 'your code',
    highlightLines: [6, 15, 16],
    status: 'new',
  },
  { path: 'apps/web/src/api/generated/index.ts', source: generatedClientCode, badge: 'generated' },
  { path: 'apps/web/src/api/generated/routes.ts', source: generatedRoutesSource, badge: 'generated' },
]

const routerProject = routerFiles
const procedureProject = procedureFiles
const middlewareProject = middlewareFiles
const pluginProject = pluginFiles
const openApiProject = openApiFiles
const backendProject = mergeProjectFiles(zoomClientOut(settleProject(routerFiles)), backendFiles)
const callProject = mergeProjectFiles(settleProject(backendFiles), callFiles)
const cacheProject = mergeProjectFiles(settleProject(backendFiles), cacheFiles)
const collectionProject = mergeProjectFiles(settleProject(backendFiles), collectionFiles)

const lessonGuides: Record<string, readonly GuidePoint[]> = {
  router: [
    {
      label: 'Name the feature boundary',
      detail: "router('tasks') gives every operation a stable, discoverable home.",
      focus: { path: 'src/api.ts', from: 12, to: 12 },
    },
    {
      label: 'Add related operations',
      detail: 'create and isUrgent share the namespace, while keeping independent inputs and results.',
      focus: { path: 'src/api.ts', from: 13, to: 21 },
    },
  ],
  procedure: [
    {
      label: 'Validate once at the edge',
      detail: 'The Zod schema is the runtime gate and the source of the inferred input type.',
      focus: { path: 'src/api.ts', from: 4, to: 7 },
    },
    {
      label: 'Use trusted input in the handler',
      detail: 'After .input(newTask), the handler receives a parsed value—no cast or second schema.',
      focus: { path: 'src/api.ts', from: 13, to: 17 },
    },
    {
      label: 'Carry the contract to the caller',
      detail: 'The same contract follows (), so an invalid priority fails before execution.',
      focus: { path: 'src/api.ts', from: 24, to: 28 },
    },
  ],
  middleware: [
    {
      label: 'Register capabilities once',
      detail: 'Named middleware keeps the router readable and the provider implementation replaceable.',
      focus: { path: 'src/api.ts', from: 5, to: 10 },
    },
    {
      label: 'Apply the shared rule high',
      detail: 'Session belongs on tasks because every task operation needs the signed-in user.',
      focus: { path: 'src/api.ts', from: 12, to: 18 },
    },
    {
      label: 'Keep the exception local',
      detail: 'Admin is added only to deleteAny; its context composes with session automatically.',
      focus: { path: 'src/api.ts', from: 23, to: 29 },
    },
  ],
  plugins: [
    {
      label: 'Install adapters at the API edge',
      detail: 'Plugins extend procedure capabilities without changing its handler or return type.',
      focus: { path: 'src/api.ts', from: 1, to: 7 },
    },
    {
      label: 'Keep ordinary procedure code',
      detail: 'The handler still performs a normal fetch and can still be called directly.',
      focus: { path: 'src/api.ts', from: 10, to: 27 },
    },
    {
      label: 'Share keys and bind query input',
      detail: 'Every file derives the same typed keys; keyed queries require their procedure input up front.',
      focus: { path: 'src/App.tsx', from: 6, to: 11 },
    },
    {
      label: 'Pass mutation input when it happens',
      detail: 'Unbound mutation options let mutate(input) provide the validated variables at interaction time.',
      focus: { path: 'src/App.tsx', from: 13, to: 17 },
    },
  ],
  openapi: [
    {
      label: 'Choose one generation path',
      detail: 'Use the direct command for a quick conversion, or api.config.ts for repeatable generation and CI.',
      focus: { path: 'api.config.ts', from: 4, to: 10 },
    },
    {
      label: 'Get routers and handlers—not just types',
      detail: 'Operation ids become @hulla/api routers, validated procedures, and handlers wired to your transport.',
      focus: { path: 'src/acme.generated.ts', from: 11, to: 18 },
    },
    {
      label: 'Own the transport policy',
      detail:
        'The only glue you write is the fetcher, so auth, base URL, retries, and tracing stay application concerns.',
      focus: { path: 'src/api.ts', from: 1, to: 10 },
    },
    {
      label: 'Call generated operations like procedures',
      detail: 'Operation ids become discoverable calls with contract-derived result types.',
      focus: { path: 'src/api.ts', from: 12, to: 13 },
    },
  ],
  backend: [
    {
      label: 'Describe the public boundary',
      detail: 'Method, path, input and output make the HTTP contract explicit beside the handler.',
      focus: { path: 'apps/backend/src/api/tasks.ts', from: 17, to: 24 },
    },
    {
      label: 'Keep business logic ordinary',
      detail: 'The handler receives validated input and can use your existing database and runtime.',
      focus: { path: 'apps/backend/src/api/tasks.ts', from: 25, to: 35 },
    },
  ],
  generation: [
    {
      label: 'Read contracts from the backend',
      detail: 'The generator discovers routers where the server already defines them.',
      focus: { path: 'api.config.ts', from: 4, to: 6 },
    },
    {
      label: 'Write behind the web API boundary',
      detail: 'Generated files stay contained beneath the web app instead of coupling both runtimes.',
      focus: { path: 'api.config.ts', from: 7, to: 11 },
    },
  ],
  calls: [
    {
      label: 'Read with the inferred result',
      detail: 'The generated call returns the serialized backend output without a duplicated client type.',
      focus: { path: 'apps/web/src/App.tsx', from: 1, to: 4 },
    },
    {
      label: 'Write with the inferred input',
      detail: 'Changing the backend input marks affected call sites before a request ships.',
      focus: { path: 'apps/web/src/App.tsx', from: 6, to: 9 },
    },
  ],
  cache: [
    {
      label: 'Derive the cache contract',
      detail: 'queryOptions supplies a stable typed key and query function from the route.',
      focus: { path: 'apps/web/src/App.tsx', from: 1, to: 6 },
    },
    {
      label: 'Render the same typed result',
      detail: 'Whether data came from the network or cache, the component still sees Task[].',
      focus: { path: 'apps/web/src/App.tsx', from: 7, to: 8 },
    },
  ],
  persistence: [
    {
      label: 'Use the generated collection wiring',
      detail: 'The app supplies its QueryClient; generated code already connects the typed CRUD routes and record key.',
      focus: { path: 'apps/web/src/tasks.db.ts', from: 1, to: 12 },
    },
    {
      label: 'Change local state immediately',
      detail: 'The collection updates first; persistence continues without blocking the interface.',
      focus: { path: 'apps/web/src/tasks.db.ts', from: 15, to: 21 },
    },
  ],
}

const localApi = createApi()
const localNewTask = z.object({
  title: z.string().trim().min(2),
  priority: z.enum(['low', 'medium', 'high']),
})
const localTasks = localApi.router('tasks').define(({ procedure }) => ({
  create: procedure
    .input(localNewTask)
    .handler(({ input }) => ({ id: crypto.randomUUID(), ...input, completed: false })),
}))

const taskListQueryOptions = client.tasks.list.$tanstack.queryOptions()

function settleProject(files: readonly LessonFile[]) {
  return files
    .filter((file) => file.status !== 'removed')
    .map(
      ({
        addedLines: _addedLines,
        highlightLines: _highlightLines,
        removedLines: _removedLines,
        status: _status,
        ...file
      }) => file
    )
}

function zoomClientOut(files: readonly LessonFile[]) {
  return files.map((file) => ({
    ...file,
    path: file.path.startsWith('src/') ? `apps/web/${file.path}` : file.path,
  }))
}

function mergeProjectFiles(...groups: readonly LessonFile[][]) {
  const files = new Map<string, LessonFile>()
  for (const group of groups) for (const file of group) files.set(file.path, file)
  return [...files.values()]
}

export function Flow() {
  const [taskTitle, setTaskTitle] = useState('  Ship the demo  ')
  const [taskPriority, setTaskPriority] = useState<'low' | 'medium' | 'high'>('high')
  const [createdTask, setCreatedTask] = useState<ReturnType<typeof localTasks.create> | null>(null)
  const [typeScenario, setTypeScenario] = useState<'valid' | 'invalid'>('valid')
  const [generationState, setGenerationState] = useState<'idle' | 'running' | 'complete'>('idle')
  const generationWorkspaceRef = useRef<HTMLDivElement>(null)
  const generationTimerRef = useRef<number | null>(null)
  const [transportRows, setTransportRows] = useState<TaskView[]>([])
  const [bridgeChanged, setBridgeChanged] = useState(false)
  const [transportPending, setTransportPending] = useState(false)
  const [transportError, setTransportError] = useState<string | null>(null)
  const [latency, setLatency] = useState(1200)
  const [cacheState, setCacheState] = useState<'idle' | 'cache' | 'network'>('idle')
  const [cacheElapsed, setCacheElapsed] = useState<number | null>(null)

  const tasks = useQuery({ ...taskListQueryOptions, enabled: false })
  const live = useLiveQuery((query) => query.from({ tasks: taskCollection }))
  const generationFiles =
    generationState === 'complete'
      ? mergeProjectFiles(generationSourceFiles, generationOutputFiles)
      : generationSourceFiles

  useEffect(() => setDemoLatency(latency), [latency])

  useEffect(
    () => () => {
      if (generationTimerRef.current !== null) window.clearTimeout(generationTimerRef.current)
    },
    []
  )

  useEffect(() => {
    if (generationState !== 'complete') return

    const scrollTimer = window.setTimeout(() => {
      generationWorkspaceRef.current?.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block: 'start',
      })
    }, 180)

    return () => window.clearTimeout(scrollTimer)
  }, [generationState])

  function createLocalTask(event: FormEvent) {
    event.preventDefault()
    setCreatedTask(localTasks.create({ title: taskTitle, priority: taskPriority }))
  }

  async function runTransport() {
    setDemoLatency(0)
    setTransportPending(true)
    setTransportError(null)
    try {
      setTransportRows(await client.tasks.list())
    } catch (reason) {
      setTransportError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setTransportPending(false)
      setDemoLatency(latency)
    }
  }

  function toggleBridgeContract() {
    setBridgeChanged((value) => !value)
    setTransportRows([])
    setTransportError(null)
  }

  function changeLatency(value: number) {
    setLatency(value)
    setDemoLatency(value)
  }

  function runGeneration() {
    if (generationTimerRef.current !== null) window.clearTimeout(generationTimerRef.current)
    setGenerationState('running')
    generationTimerRef.current = window.setTimeout(() => {
      setGenerationState('complete')
      generationTimerRef.current = null
    }, 1700)
  }

  async function readTasks() {
    const started = performance.now()
    const key = taskListQueryOptions.queryKey
    if (cacheState !== 'idle' && queryClient.getQueryData(key)) {
      setCacheState('cache')
      setCacheElapsed(Math.max(1, Math.round(performance.now() - started)))
      return
    }
    if (cacheState === 'idle') queryClient.removeQueries({ queryKey: key })
    setCacheState('network')
    await tasks.refetch()
    setCacheElapsed(Math.round(performance.now() - started))
  }

  function clearCache() {
    queryClient.removeQueries({ queryKey: taskListQueryOptions.queryKey })
    setCacheState('idle')
    setCacheElapsed(null)
  }

  return (
    <main className="story" id="top">
      <section className="story-hero">
        <div>
          <p className="eyebrow">
            <code className="inline-code">@hulla/api</code> / one contract across your stack
          </p>
          <h1>
            Keep your backend. <i>Stop rewriting its contract.</i>
          </h1>
          <p>
            <code className="inline-code">@hulla/api</code> keeps handlers, validation, HTTP routes, and client types
            attached to one procedure tree. This tour teaches those pieces locally, then assembles the complete
            server-to-client workflow—without replacing the framework or database you already use.
          </p>
          <a className="primary-link" href="#router">
            Follow the full contract <span>↓</span>
          </a>
        </div>
        <ol className="story-index" aria-label="Learning path">
          <li>
            <span>01</span>
            <strong>Define</strong>
            <small>router · procedure · middleware</small>
          </li>
          <li>
            <span>02</span>
            <strong>Extend</strong>
            <small>query adapters · existing OpenAPI</small>
          </li>
          <li className="story-index-featured">
            <span>03</span>
            <strong>Connect</strong>
            <small>your server · generation · client</small>
          </li>
          <li>
            <span>04</span>
            <strong>Accelerate</strong>
            <small>query cache · local-first state</small>
          </li>
        </ol>
      </section>

      <StoryStep
        id="router"
        number="01"
        eyebrow="Core / router"
        title="A router is the typed home for one feature."
        summary="Name the feature once and keep every operation under tasks. Start with the contract itself; the same router can stay local or become part of your server's HTTP API."
        signature="api.router('tasks')"
        files={routerFiles}
        projectFiles={routerProject}
        guide={lessonGuides.router}
      />

      <StoryStep
        id="procedure"
        number="02"
        eyebrow="Core / procedure + schema"
        title="A procedure turns unknown input into useful work."
        summary="One schema validates runtime input and supplies both the handler and caller types."
        signature="procedure.input(schema)"
        files={procedureFiles}
        projectFiles={procedureProject}
        guide={lessonGuides.procedure}
        visual={
          <TypeSafetyLab
            scenario={typeScenario}
            onScenario={setTypeScenario}
            title={taskTitle}
            onTitle={setTaskTitle}
            priority={taskPriority}
            onPriority={setTaskPriority}
            created={createdTask}
            onSubmit={createLocalTask}
          />
        }
      />

      <StoryStep
        id="middleware"
        number="03"
        eyebrow="Core / middleware"
        title="Shared rules belong on the router. Exceptional rules stay local."
        summary="Put session checks on the router; add admin only where the risk changes."
        signature="router.use('session')"
        files={middlewareFiles}
        projectFiles={middlewareProject}
        guide={lessonGuides.middleware}
      />

      <StoryStep
        id="plugins"
        number="04"
        eyebrow="Extension system / plugins"
        title="Give every query and mutation the same cache identity."
        summary="The adapter derives keys and functions from the procedure, so components, invalidations, and mutations cannot quietly drift into different conventions across files."
        signature="tasks.list.$tanstack.queryOptions()"
        files={pluginFiles}
        projectFiles={pluginProject}
        guide={lessonGuides.plugins}
        visual={<PluginSurface />}
      />

      <StoryStep
        id="openapi"
        number="05"
        eyebrow="Existing API / OpenAPI"
        title="Generate the whole procedure layer from an OpenAPI contract."
        summary="Schemas, routers, handlers, and typed calls are generated together. You only supply the transport policy."
        signature="@hulla/api-openapi"
        files={openApiFiles}
        projectFiles={openApiProject}
        guide={lessonGuides.openapi}
        lead={<OpenApiTerminal />}
      />

      <StoryStep
        id="backend"
        number="06"
        eyebrow="Complete workflow / client + server"
        badge="Your server completes the contract"
        title={
          <>
            Client-only is a start. <code className="inline-code">@hulla/api</code> shines when your server shares the
            contract.
          </>
        }
        summary={
          <>
            <code className="inline-code">@hulla/api</code> fits the backend you already run—from Fetch-native runtimes
            and frameworks to Express and Nest—while your handlers keep using any database. It takes care of route
            definitions, validation, HTTP transport, serialization, and generated client types, so you can focus on
            business logic instead of API glue.
          </>
        }
        signature="route('GET', '/tasks')"
        files={backendFiles}
        projectFiles={backendProject}
        realm="backend"
        guide={lessonGuides.backend}
      />

      <StoryStep
        id="generation"
        number="07"
        eyebrow="Build step / generation"
        title="Generate the bridge inside the web app's API boundary."
        summary="One config carries the server contract into a browser-safe client."
        signature="hulla api generate"
        files={generationFiles}
        projectFiles={generationFiles}
        realm="backend"
        guide={lessonGuides.generation}
        revealPath={generationState === 'complete' ? 'apps/web/src/api/generated/routes.ts' : undefined}
        workspaceRef={generationWorkspaceRef}
        workspaceReveal={generationState === 'complete'}
      >
        <GenerationConsole state={generationState} onRun={runGeneration} />
        <LiveGenerationPlayground />
      </StoryStep>

      <StoryStep
        id="calls"
        number="08"
        eyebrow="Generated bridge / end-to-end contract"
        title="Generation makes two independent apps feel like one typed system."
        summary="Types travel at build time. Plain HTTP travels at runtime."
        signature="tasks.list() → GET /api/tasks"
        files={callFiles}
        projectFiles={callProject}
        realm="bridge"
        guide={lessonGuides.calls}
      >
        <ContractBridgeDemo
          changed={bridgeChanged}
          rows={transportRows}
          error={transportError}
          pending={transportPending}
          onRun={runTransport}
          onChange={toggleBridgeContract}
        />
      </StoryStep>

      <StoryStep
        id="cache"
        number="09"
        eyebrow="Plugin payoff / query cache"
        title="The cache can answer before the network is needed."
        summary="The first read pays for the network. Fresh reads reuse the same typed result instantly."
        signature="tasks.list.$tanstack.queryOptions()"
        files={cacheFiles}
        projectFiles={cacheProject}
        realm="state"
        guide={lessonGuides.cache}
      >
        <CacheLab
          latency={latency}
          state={cacheState}
          elapsed={cacheElapsed}
          pending={tasks.isFetching}
          rows={tasks.data ?? []}
          onLatency={changeLatency}
          onRead={() => void readTasks()}
          onClear={clearCache}
        />
      </StoryStep>

      <StoryStep
        id="persistence"
        number="10"
        eyebrow="Local-first / TanStack DB"
        title="Cached reads are instant. Writes can still feel slow."
        summary="Update the local collection now, then reconcile with the server in the background."
        signature="taskCollection.update(id, draft)"
        files={collectionFiles}
        projectFiles={collectionProject}
        realm="state"
        guide={lessonGuides.persistence}
      >
        <LocalFirstLab latency={latency} onLatency={changeLatency} tasks={live.data ?? []} />
      </StoryStep>

      <section className="story-outro">
        <p className="eyebrow">One router / only the layers you need</p>
        <h2>Local procedures are the beginning, not a limitation.</h2>
        <p>
          Add a network, plugin, cache, or local database when it earns its place. The feature vocabulary stays stable.
        </p>
        <a href="#top">Return to the beginning ↑</a>
      </section>
    </main>
  )
}

function StoryStep({
  id,
  number,
  eyebrow,
  badge,
  title,
  summary,
  signature,
  files,
  projectFiles,
  guide,
  realm = 'client',
  lead,
  visual,
  children,
  revealPath,
  workspaceRef,
  workspaceReveal = false,
}: {
  id: string
  number: string
  eyebrow: string
  badge?: string
  title: ReactNode
  summary: ReactNode
  signature: string
  files: readonly LessonFile[]
  projectFiles: readonly LessonFile[]
  guide: readonly GuidePoint[]
  realm?: 'client' | 'backend' | 'bridge' | 'state'
  lead?: ReactNode
  visual?: ReactNode
  children?: ReactNode
  revealPath?: string
  workspaceRef?: Ref<HTMLDivElement>
  workspaceReveal?: boolean
}) {
  const [activeGuide, setActiveGuide] = useState<number | null>(null)
  const focus = activeGuide === null ? undefined : guide[activeGuide]?.focus

  return (
    <section className={`story-step realm-${realm} step-${id}`} id={id}>
      {badge ? (
        <div className="capability-ribbon">
          <span>+</span>
          {badge}
        </div>
      ) : null}
      <header className="story-step-heading">
        <div className="step-kicker">
          <span>{number}</span>
          <p className="eyebrow">{eyebrow}</p>
        </div>
        <div className="story-title-row">
          <h2>{title}</h2>
          <pre className="heading-code-accent" aria-label={`Key API expression: ${signature}`}>
            <code>{signature}</code>
          </pre>
        </div>
        <p>{summary}</p>
      </header>
      {lead ? <div className="story-lead">{lead}</div> : null}
      <div className={`lesson-composition ${workspaceReveal ? 'generation-reveal' : ''}`} ref={workspaceRef}>
        {workspaceReveal ? (
          <div aria-live="polite" className="workspace-reveal-toast" role="status">
            <span>Build complete</span>
            <strong>+2 typed files</strong>
          </div>
        ) : null}
        <Workspace files={files} focus={focus} projectFiles={projectFiles} revealPath={revealPath} />
        <ReadingGuide active={activeGuide} guide={guide} onChange={setActiveGuide} />
      </div>
      {visual ? <div className="story-lab">{visual}</div> : null}
      {children ? <div className="story-action">{children}</div> : null}
    </section>
  )
}

function ReadingGuide({
  active,
  guide,
  onChange,
}: {
  active: number | null
  guide: readonly GuidePoint[]
  onChange: (index: number | null) => void
}) {
  return (
    <aside
      className="reading-guide"
      aria-label="Guided code reading"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onChange(null)
      }}
      onMouseLeave={() => onChange(null)}
    >
      <div className="reading-guide-heading">
        <p className="micro-label">Hover to read the code</p>
        <span>{String(guide.length).padStart(2, '0')} concepts</span>
      </div>
      <ol>
        {guide.map((point, index) => (
          <li
            className={active === index ? 'active' : ''}
            key={`${point.focus.path}-${point.focus.from}`}
            onMouseLeave={() => onChange(null)}
          >
            <button
              aria-pressed={active === index}
              onClick={() => onChange(index)}
              onFocus={() => onChange(index)}
              onMouseEnter={() => onChange(index)}
              type="button"
            >
              <span>{String(index + 1).padStart(2, '0')}</span>
              <strong>{point.label}</strong>
              <small>
                <CodeProse>{point.detail}</CodeProse>
              </small>
              <em>
                {point.focus.path.split('/').at(-1)} · L{point.focus.from}–{point.focus.to}
              </em>
            </button>
          </li>
        ))}
      </ol>
      <p className="reading-guide-hint">
        <span>↗</span> Move away to restore the full editor.
      </p>
    </aside>
  )
}

function TypeSafetyLab({
  scenario,
  onScenario,
  title,
  onTitle,
  priority,
  onPriority,
  created,
  onSubmit,
}: {
  scenario: 'valid' | 'invalid'
  onScenario: (scenario: 'valid' | 'invalid') => void
  title: string
  onTitle: (title: string) => void
  priority: 'low' | 'medium' | 'high'
  onPriority: (priority: 'low' | 'medium' | 'high') => void
  created: ReturnType<typeof localTasks.create> | null
  onSubmit: (event: FormEvent) => void
}) {
  return (
    <div className="validation-lab type-safety-lab">
      <p className="micro-label">One contract / two outcomes</p>
      <div className="scenario-switch">
        <button className={scenario === 'valid' ? 'active' : ''} onClick={() => onScenario('valid')} type="button">
          Valid call
        </button>
        <button
          className={scenario === 'invalid' ? 'active error' : ''}
          onClick={() => onScenario('invalid')}
          type="button"
        >
          Production bug
        </button>
      </div>
      {scenario === 'valid' ? (
        <form onSubmit={onSubmit}>
          <label>
            <span>Task title</span>
            <input value={title} onChange={(event) => onTitle(event.currentTarget.value)} />
          </label>
          <label>
            <span>Priority</span>
            <select value={priority} onChange={(event) => onPriority(event.currentTarget.value as typeof priority)}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </label>
          <button>Create local task</button>
          <pre>{created ? JSON.stringify(created, null, 2) : '// Ready to create'}</pre>
        </form>
      ) : (
        <div className="type-error-demo">
          <pre>
            <code>
              tasks.create({'{'}
              {'\n'}&nbsp;&nbsp;title: 'Ship the demo',
              {'\n'}&nbsp;&nbsp;priority: <mark>'urgent'</mark>
              {'\n'}
              {'}'})
            </code>
          </pre>
          <div>
            <span>TS2322 · before runtime</span>
            <strong>Type 'urgent' is not assignable to 'low' | 'medium' | 'high'.</strong>
            <small>No request was sent. This cannot become bad production data.</small>
          </div>
          <p>
            Change the priority in <code>api.ts</code> and hover the error to inspect the inferred union.
          </p>
        </div>
      )}
    </div>
  )
}

function OpenApiTerminal() {
  return (
    <div className="openapi-generation-options">
      <div className="openapi-terminal">
        <header>
          <span>Quick generation / terminal</span>
          <small>Best for trying a contract once</small>
        </header>
        <code className="openapi-command">
          <i>$</i> bunx @hulla/api-openapi ./openapi/acme.json --output ./apps/web/src/api/acme.generated.ts
        </code>
      </div>

      <div className="openapi-or" aria-label="or">
        <span>OR</span>
      </div>

      <section className="openapi-config-option">
        <div>
          <small>Repeatable project generation</small>
          <strong>api.config.ts</strong>
        </div>
        <p>Best for CI and watch mode · source shown below</p>
      </section>
    </div>
  )
}

function PluginSurface() {
  const handwrittenIntegration = `useQuery({
  queryKey: ['tasks', 'list'],
  queryFn: () => tasks.list(),
})

useMutation({
  mutationKey: ['tasks', 'create'],
  mutationFn: input => tasks.create(input),
})`
  const procedureDerivedIntegration = `useQuery(tasks.list.$tanstack.queryOptions())

useMutation(tasks.create.$tanstack.mutationOptions())`

  return (
    <div className="plugin-surface">
      <header className="plugin-surface-heading">
        <p className="micro-label">One procedure / one cache identity</p>
        <h3>Make cache consistency the default.</h3>
        <p>
          The adapter derives query keys, mutation keys, and their functions from the procedure path and typed input.
          Every component, prefetch, and invalidation can address the same data without coordinating string arrays
          across files.
        </p>
      </header>
      <aside className="plugin-promise">
        <strong>No key registry to maintain.</strong>
        <span>
          No duplicated strings. No wrapper functions. No naming convention that only survives through code review.
        </span>
      </aside>
      <div className="plugin-comparison">
        <section className="plugin-before">
          <header>
            <span>Handwritten integration</span>
            <small>recreated by every consumer</small>
          </header>
          <pre>
            <HighlightedTypeScript code={handwrittenIntegration} lineNumbers={false} />
          </pre>
          <footer>
            <span>You maintain</span>
            <b>keys + wrappers + cross-file conventions</b>
          </footer>
        </section>
        <div className="plugin-swap" aria-hidden="true">
          <span>plugin</span>
          <b>→</b>
        </div>
        <section className="plugin-after">
          <header>
            <span>Procedure-derived</span>
            <small>consistent in every file</small>
          </header>
          <pre>
            <HighlightedTypeScript code={procedureDerivedIntegration} lineNumbers={false} />
          </pre>
          <footer>
            <span>The adapter guarantees</span>
            <b>typed keys + functions from one source</b>
          </footer>
        </section>
      </div>
      <aside className="plugin-boundary">
        <span>Still TanStack Query</span>
        <code>useQuery(…)</code>
        <code>useMutation(…)</code>
        <i>·</i>
        <span>Now procedure-derived</span>
        <code>queryKey</code>
        <code>mutationKey</code>
        <code>queryFn / mutationFn</code>
      </aside>
    </div>
  )
}

function GenerationConsole({ state, onRun }: { state: 'idle' | 'running' | 'complete'; onRun: () => void }) {
  return (
    <div className={`generation-console generation-${state}`}>
      <header className="generation-callout">
        <div>
          <p className="micro-label">The handoff</p>
          <h2>Turn the backend contract into a client.</h2>
          <p>The config above is all the generator needs. Run it and watch the web app gain typed files.</p>
        </div>
        <button disabled={state === 'running'} onClick={onRun}>
          <span>
            {state === 'complete' ? 'Run again' : state === 'running' ? 'Generating…' : 'Generate typed client'}
          </span>
          <b>→</b>
        </button>
      </header>
      <div className="generation-terminal">
        <div className="terminal-chrome">
          <i />
          <i />
          <i />
          <span>demo — hulla api generate</span>
        </div>
        <div className="terminal-session">
          <code>
            <b>$</b> hulla api generate
          </code>
          {state === 'idle' ? <code className="terminal-hint">Waiting for you…</code> : null}
          {state !== 'idle' ? (
            <>
              <code className="terminal-step step-one">◇ scanning apps/backend/src/api/tasks.ts</code>
              <code className="terminal-step step-two">◇ resolving schemas and plugins</code>
              <code className="terminal-step step-three">✓ wrote apps/web/src/api/generated/routes.ts</code>
              <code className="terminal-step step-four">✓ wrote apps/web/src/api/generated/index.ts</code>
            </>
          ) : null}
        </div>
      </div>
      <p className="generation-result">
        {state === 'complete'
          ? 'New files are now in the explorer. Next, use client.tasks with end-to-end autocomplete.'
          : 'Nothing is hidden: source routers go in, ordinary TypeScript files come out.'}
      </p>
    </div>
  )
}

const playgroundInitialSource = `import { createApi } from '@hulla/api'
import { z } from 'zod'

const api = createApi()

const task = z.object({
  id: z.string(),
  priority: z.enum(['low', 'medium', 'high']),
})

const tasksStore = [{ id: 'task_1', priority: 'high' as const }]

export const tasks = api.router('tasks').define(({ route }) => ({
  list: route('GET', '/')
    .output(z.array(task))
    .handler(() => tasksStore),

  create: route('POST', '/')
    .output(task)
    .handler(() => tasksStore[0]),
}))`

const archiveRoutePreset = `  archive: route('PATCH', '/archive')
    .output(task)
    .handler(() => tasksStore[0]),`

const searchRoutePreset = `  search: route('GET', '/search')
    .output(z.array(task))
    .handler(() => tasksStore),`

function LiveGenerationPlayground() {
  const [source, setSource] = useState(playgroundInitialSource)
  const [generatedSource, setGeneratedSource] = useState(playgroundInitialSource)
  const [previousGeneratedSource, setPreviousGeneratedSource] = useState(playgroundInitialSource)
  const [generationState, setGenerationState] = useState<'watching' | 'building' | 'synced'>('watching')
  const [revision, setRevision] = useState(0)
  const [lastChange, setLastChange] = useState('Initial contract')
  const generatorTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const sourceContract = parsePlaygroundContract(source)
  const generatedContract = parsePlaygroundContract(generatedSource)
  const generatedCode = playgroundGeneratedCode(generatedContract)
  const previousGeneratedCode = playgroundGeneratedCode(parsePlaygroundContract(previousGeneratedSource))
  const changedGeneratedLines = revision > 0 ? changedLineNumbers(previousGeneratedCode, generatedCode) : []

  useEffect(
    () => () => {
      if (generatorTimer.current) clearTimeout(generatorTimer.current)
    },
    []
  )

  function commitSource(nextSource: string, message: string) {
    if (generatorTimer.current) clearTimeout(generatorTimer.current)
    setSource(nextSource)
    setGenerationState('building')
    generatorTimer.current = setTimeout(() => {
      setPreviousGeneratedSource(generatedSource)
      setGeneratedSource(nextSource)
      setRevision((value) => value + 1)
      setLastChange(message)
      setGenerationState('synced')
      generatorTimer.current = null
    }, 620)
  }

  function editSource(nextSource: string) {
    commitSource(nextSource, 'Edited tasks.ts')
  }

  function addPresetRoute(routeName: string, routeSource: string) {
    if (sourceContract.routes.some((route) => route.name === routeName)) return
    const closingIndex = source.lastIndexOf('\n}))')
    if (closingIndex < 0) return
    commitSource(
      `${source.slice(0, closingIndex)}\n\n${routeSource}${source.slice(closingIndex)}`,
      `Added tasks.${routeName}`
    )
  }

  function makePriorityNumeric() {
    const nextSource = source
      .replace(/priority:\s*[^\n]+/, 'priority: z.number(),')
      .replace("priority: 'high' as const", 'priority: 1')
    if (nextSource !== source) commitSource(nextSource, 'Task.priority → number')
  }

  return (
    <section className="live-generation-playground" aria-labelledby="live-generation-title">
      <header className="playground-heading">
        <div>
          <p className="micro-label">Live contract lab / no build wait</p>
          <h2 id="live-generation-title">Choose a suggestion. Watch dev mode keep up.</h2>
          <p>
            Apply an editor suggestion or type directly in <code>tasks.ts</code>. The running dev process detects the
            change and refreshes only the affected client lines.
          </p>
        </div>
        <div className="playground-live-state" aria-live="polite" key={`status-${revision}`}>
          <i />
          <span>Revision {String(revision + 1).padStart(2, '0')}</span>
          <strong>{lastChange}</strong>
        </div>
      </header>

      <div className="playground-pipeline">
        <div className="playground-code-grid">
          <div className="playground-source-editor">
            <div className="playground-editor-label">
              <span>01 / editable source</span>
              <strong>Suggestions live inside the editor — manual edits still welcome.</strong>
            </div>
            <Code
              filename="apps/backend/src/api/tasks.ts"
              height={455}
              onChange={editSource}
              panel={
                <div className="playground-editor-suggestions">
                  <header>
                    <span>
                      <i>✦</i> Suggested edits
                    </span>
                    <small>Tab through · Enter to apply</small>
                  </header>
                  <div className="playground-suggestion-list" aria-label="Suggested backend edits">
                    <button
                      data-active={!sourceContract.routes.some((route) => route.name === 'archive')}
                      disabled={sourceContract.routes.some((route) => route.name === 'archive')}
                      onClick={() => addPresetRoute('archive', archiveRoutePreset)}
                      type="button"
                    >
                      <span>
                        <kbd>1</kbd>
                        <strong>Add archive route</strong>
                      </span>
                      <code>+ PATCH /archive</code>
                      <em>
                        {sourceContract.routes.some((route) => route.name === 'archive') ? 'applied ✓' : '↵ apply'}
                      </em>
                    </button>
                    <button
                      disabled={sourceContract.priorityType === 'number'}
                      onClick={makePriorityNumeric}
                      type="button"
                    >
                      <span>
                        <kbd>2</kbd>
                        <strong>Make priority numeric</strong>
                      </span>
                      <code>priority: z.number()</code>
                      <em>{sourceContract.priorityType === 'number' ? 'applied ✓' : '↵ apply'}</em>
                    </button>
                    <button
                      disabled={sourceContract.routes.some((route) => route.name === 'search')}
                      onClick={() => addPresetRoute('search', searchRoutePreset)}
                      type="button"
                    >
                      <span>
                        <kbd>3</kbd>
                        <strong>Add search route</strong>
                      </span>
                      <code>+ GET /search</code>
                      <em>
                        {sourceContract.routes.some((route) => route.name === 'search') ? 'applied ✓' : '↵ apply'}
                      </em>
                    </button>
                    <button
                      className="playground-suggestion-reset"
                      disabled={source === playgroundInitialSource}
                      onClick={() => commitSource(playgroundInitialSource, 'Reset to initial contract')}
                      type="button"
                    >
                      <span>↺</span>
                      <strong>Reset</strong>
                    </button>
                  </div>
                  <div className="playground-editor-routes" aria-label="Routes detected in the backend source">
                    <span>tasks</span>
                    {sourceContract.routes.map((route) => (
                      <code key={`${route.name}-${route.method}-${route.path}`}>
                        <i>{route.method}</i>.{route.name}
                      </code>
                    ))}
                    <strong className={`editor-watch-${generationState}`}>
                      {generationState === 'building' ? 'change detected…' : 'dev process watching'}
                    </strong>
                  </div>
                </div>
              }
              resettable={false}
            >
              {source}
            </Code>
          </div>

          <div className="playground-output-column">
            <div className={`playground-cli cli-${generationState}`}>
              <div className="playground-cli-label">
                <span>02 / live dev process</span>
                <strong>
                  {generationState === 'building' ? 'Source change detected.' : 'Watching the backend contract.'}
                </strong>
              </div>
              <div className="playground-cli-session">
                <div className="playground-cli-command">
                  <code>
                    <i>~/demo</i> <b>$</b> hulla api dev
                  </code>
                  <span>
                    <i /> running
                  </span>
                </div>
                <div className="playground-cli-output" aria-live="polite" key={`${generationState}-${revision}`}>
                  {generationState === 'watching' ? <span>◇ watching apps/backend/src/api/**/*.ts</span> : null}
                  {generationState === 'building' ? (
                    <>
                      <span>● change detected in tasks.ts</span>
                      <span>◇ regenerating client…</span>
                    </>
                  ) : null}
                  {generationState === 'synced' ? (
                    <>
                      <span>✓ regenerated apps/web/src/api/generated/routes.ts</span>
                      <small>42ms · watching for changes</small>
                    </>
                  ) : null}
                </div>
              </div>
            </div>

            <div
              className={`playground-sync-rail sync-${generationState}`}
              aria-hidden="true"
              key={`generator-${revision}-${generationState}`}
            >
              <span>
                <i /> {generationState === 'building' ? 'Source changed' : 'Source watched'}
              </span>
              <div>
                <b />
              </div>
              <strong>{generationState === 'building' ? 'Regenerating client' : 'Generated client synced'}</strong>
            </div>

            <article
              className={`playground-code generated-code generated-${generationState}`}
              key={`client-${revision}`}
            >
              <header>
                <span>03 / GENERATED · READ ONLY</span>
                <strong>apps/web/src/api/generated/routes.ts</strong>
                <small>derived automatically</small>
              </header>
              <pre>
                <HighlightedTypeScript changedLines={changedGeneratedLines} code={generatedCode} />
              </pre>
              <footer>
                <span>{generationState === 'building' ? '◌ regenerating' : '✓ synced'}</span>
                <code>
                  {generatedContract.routes.length} routes · Task.priority: {generatedContract.priorityType}
                </code>
              </footer>
            </article>
          </div>
        </div>
      </div>
    </section>
  )
}

function playgroundGeneratedCode(contract: ReturnType<typeof parsePlaygroundContract>) {
  const clientRoutes = contract.routes
    .map(
      (route) =>
        `  ${route.name}: procedure\n    .output(clientSchema<${route.output}>())\n    // ${route.method} /api/tasks${route.path === '/' ? '' : route.path},`
    )
    .join('\n\n')
  return `type Task = {\n  id: string\n  priority: ${contract.priorityType}\n}\n\n${clientRoutes || '// Edit or add a route in tasks.ts'}`
}

function changedLineNumbers(previous: string, next: string) {
  const previousLines = previous.split('\n')
  return next.split('\n').flatMap((line, index) => (line === previousLines[index] ? [] : [index + 1]))
}

function parsePlaygroundContract(source: string) {
  const enumSource = source.match(/priority:\s*z\.enum\(\[([^\]]*)\]\)/)?.[1]
  const enumValues = enumSource ? [...enumSource.matchAll(/['"]([^'"]+)['"]/g)].map((match) => `'${match[1]}'`) : []
  const priorityType =
    enumValues.length > 0
      ? enumValues.join(' | ')
      : /priority:\s*z\.number\(/.test(source)
        ? 'number'
        : /priority:\s*z\.string\(/.test(source)
          ? 'string'
          : 'unknown'
  const routes: PlaygroundRoute[] = []
  const routePattern =
    /^\s*([A-Za-z_$][\w$]*):\s*route\(\s*['"](GET|POST|PATCH|DELETE)['"]\s*,\s*['"]([^'"]+)['"]\s*\)\s*\n\s*\.output\(([^\n]+)\)/gm

  for (const match of source.matchAll(routePattern)) {
    routes.push({
      name: match[1],
      method: match[2] as PlaygroundMethod,
      path: match[3],
      output: playgroundOutputType(match[4]),
    })
  }

  return { priorityType, routes }
}

function playgroundOutputType(schema: string) {
  const normalized = schema.replaceAll(/\s/g, '')
  if (normalized === 'task') return 'Task'
  if (normalized === 'z.array(task)') return 'Task[]'
  if (normalized.startsWith('z.boolean(')) return 'boolean'
  if (normalized.startsWith('z.number(')) return 'number'
  if (normalized.startsWith('z.string(')) return 'string'
  return 'unknown'
}

const typeScriptTokenPattern =
  /(\/\/.*|\/\*.*?\*\/|'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`|\b(?:const|export|type|return|import|from|as|extends|infer|readonly|new|typeof|true|false|null|undefined)\b|\b(?:queryKey|mutationKey|queryFn|mutationFn)\b|\b(?:string|number|boolean|unknown|Task)\b|\b\d+\b|\b[A-Za-z_$][\w$]*(?=\())/g

function HighlightedTypeScript({
  code,
  lineNumbers = true,
  changedLines = [],
}: {
  code: string
  lineNumbers?: boolean
  changedLines?: readonly number[]
}) {
  return (
    <code className={`syntax-code${lineNumbers ? '' : ' syntax-code-plain'}`}>
      {code.split('\n').map((line, index) => {
        const lineNumber = index + 1
        return (
          <span
            className={`syntax-line${changedLines.includes(lineNumber) ? ' syntax-line-changed' : ''}`}
            key={`${index}-${line}`}
          >
            {lineNumbers ? (
              <span aria-hidden="true" className="syntax-line-number">
                {String(lineNumber).padStart(2, '0')}
              </span>
            ) : null}
            <span className="syntax-line-content">{highlightTypeScriptLine(line)}</span>
          </span>
        )
      })}
    </code>
  )
}

function highlightTypeScriptLine(line: string) {
  const fragments: ReactNode[] = []
  let cursor = 0

  for (const match of line.matchAll(typeScriptTokenPattern)) {
    const start = match.index ?? 0
    if (start > cursor) fragments.push(line.slice(cursor, start))
    fragments.push(
      <span className={`syntax-${typeScriptTokenKind(match[0])}`} key={`${start}-${match[0]}`}>
        {match[0]}
      </span>
    )
    cursor = start + match[0].length
  }

  if (cursor < line.length) fragments.push(line.slice(cursor))
  return fragments.length > 0 ? fragments : '\u00a0'
}

function typeScriptTokenKind(token: string) {
  if (token.startsWith('//') || token.startsWith('/*')) return 'comment'
  if (token.startsWith("'") || token.startsWith('"') || token.startsWith('`')) return 'string'
  if (/^\d+$/.test(token)) return 'number'
  if (/^(queryKey|mutationKey|queryFn|mutationFn)$/.test(token)) return 'property'
  if (/^(string|number|boolean|unknown|Task)$/.test(token)) return 'type'
  if (
    /^(const|export|type|return|import|from|as|extends|infer|readonly|new|typeof|true|false|null|undefined)$/.test(
      token
    )
  )
    return 'keyword'
  return 'function'
}

function ContractBridgeDemo({
  changed,
  rows,
  error,
  pending,
  onRun,
  onChange,
}: {
  changed: boolean
  rows: readonly TaskView[]
  error: string | null
  pending: boolean
  onRun: () => Promise<void>
  onChange: () => void
}) {
  const [stage, setStage] = useState<0 | 1 | 2 | 3>(0)
  const stages = [
    {
      kicker: '01 / source of truth',
      label: 'Backend contract',
      title: 'Start with the shape the backend promises.',
      summary:
        'The output schema is the public contract. It validates real responses and gives generation one reliable source to read.',
    },
    {
      kicker: '02 / build time',
      label: 'Generated types',
      title: 'Generation carries that promise across the workspace.',
      summary:
        'The generator reads route metadata and schemas, then writes browser-safe TypeScript into the web app. No backend implementation is bundled.',
    },
    {
      kicker: '03 / developer feedback',
      label: 'Web app',
      title: 'The web app feels a contract change before it runs.',
      summary:
        'Autocomplete and typechecking now follow the generated Task shape. Change the backend output below to see the affected client code.',
    },
    {
      kicker: '04 / runtime',
      label: 'HTTP exchange',
      title: 'Only the call crosses the network.',
      summary:
        'At runtime the generated client sends ordinary HTTP. The backend validates its output, then the typed result returns to the web app.',
    },
  ] as const
  const current = stages[stage]

  function goToStage(nextStage: number) {
    if (nextStage < 0 || nextStage > 3) return
    if (nextStage === 3 && changed) return
    setStage(nextStage as 0 | 1 | 2 | 3)
  }

  function toggleContract() {
    onChange()
    setStage(2)
  }

  return (
    <div className={`contract-bridge-demo ${changed ? 'bridge-changed' : 'bridge-aligned'}`}>
      <section className="bridge-board">
        <div className="bridge-heading">
          <div>
            <p className="micro-label">One contract / four small steps</p>
            <h2>{current.title}</h2>
            <p>{current.summary}</p>
          </div>
          <span className="bridge-stage-count">{String(stage + 1).padStart(2, '0')} / 04</span>
        </div>

        <nav className="bridge-progress" aria-label="Contract walkthrough">
          {stages.map((item, index) => (
            <button
              aria-current={index === stage ? 'step' : undefined}
              className={index === stage ? 'active' : index < stage ? 'visited' : ''}
              disabled={index === 3 && changed}
              key={item.label}
              onClick={() => goToStage(index)}
              type="button"
            >
              <span>{String(index + 1).padStart(2, '0')}</span>
              <strong>{item.label}</strong>
            </button>
          ))}
        </nav>

        <div className="bridge-focus" key={stage}>
          <p className="bridge-focus-kicker">{current.kicker}</p>

          {stage === 0 ? (
            <div className="bridge-source-stage">
              <article className="bridge-primary-card backend-card">
                <span>APPS / BACKEND</span>
                <strong>src/api/tasks.ts</strong>
                <pre>
                  <code>list: route('GET', '/')</code>
                  <code> .output(z.array(task))</code>
                </pre>
              </article>
              <aside className="bridge-effect-note">
                <span>WHAT THIS CONTROLS</span>
                <strong>The shape of every successful task response.</strong>
                <p>Change the schema here first. Everything downstream can then be regenerated from it.</p>
              </aside>
            </div>
          ) : null}

          {stage === 1 ? (
            <div className="bridge-generation-stage">
              <article className="bridge-compact-card">
                <span>INPUT</span>
                <strong>Backend route + Zod schema</strong>
              </article>
              <div className="bridge-transfer" aria-label="Generation copies the contract into the web app">
                <i>→</i>
                <strong>hulla api generate</strong>
                <small>build time</small>
              </div>
              <article className="bridge-primary-card generated-card">
                <span>OUTPUT / WEB APP</span>
                <strong>src/api/generated</strong>
                <pre>
                  <code>{'type Task = {'}</code>
                  <code> priority: 'low' | 'medium' | 'high'</code>
                  <code>{'}'}</code>
                </pre>
              </article>
            </div>
          ) : null}

          {stage === 2 ? (
            <div className="bridge-client-stage">
              <article className={`bridge-primary-card client-card ${changed ? 'has-error' : ''}`}>
                <span>APPS / WEB / App.tsx</span>
                <strong>Client code follows the generated Task type.</strong>
                <pre>
                  <code>const tasks = await client.tasks.list()</code>
                  <code>
                    tasks[0].<mark>priority</mark>
                  </code>
                </pre>
                <small>
                  {changed
                    ? "TS2339 · Property 'priority' does not exist on TaskV2."
                    : "Autocomplete: 'low' | 'medium' | 'high'"}
                </small>
              </article>
              <aside className="bridge-change-card">
                <span>TRY THE INFLUENCE</span>
                <strong>{changed ? 'The backend now returns TaskV2.' : 'Change the backend output.'}</strong>
                <p>
                  {changed
                    ? 'Generation updates the client type, so this stale property is caught before an HTTP request.'
                    : 'Rename priority to urgency, regenerate, and watch the client point to the exact affected line.'}
                </p>
                <button onClick={toggleContract} type="button">
                  {changed ? 'Restore original contract' : 'Rename priority → urgency'}
                </button>
              </aside>
            </div>
          ) : null}

          {stage === 3 ? (
            <div className="bridge-runtime-stage">
              <ol aria-label="Generated client request and validated response">
                <li>
                  <span>01 / WEB APP</span>
                  <code>client.tasks.list()</code>
                </li>
                <li className="wire-step">
                  <span>02 / STANDARD HTTP</span>
                  <code>GET /api/tasks →</code>
                </li>
                <li>
                  <span>03 / BACKEND</span>
                  <code>output(z.array(task))</code>
                </li>
                <li className="response-step">
                  <span>04 / TYPED RESULT</span>
                  <code>← 200 · Task[]</code>
                </li>
              </ol>
              <div className={`bridge-runtime-action ${error ? 'error' : ''}`}>
                <div>
                  <span>{error ? 'REQUEST ERROR' : rows.length ? 'EXCHANGE CAPTURED' : 'READY TO SEND'}</span>
                  <strong>
                    {error ??
                      (rows.length
                        ? `${rows.length} validated task records returned.`
                        : 'Run the call, then inspect the real request and response below.')}
                  </strong>
                </div>
                <button disabled={pending} onClick={() => void onRun()} type="button">
                  {pending ? 'Calling…' : rows.length ? 'Run request again' : 'Run typed request'}
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <footer className="bridge-controls">
          <button disabled={stage === 0} onClick={() => goToStage(stage - 1)} type="button">
            ← Previous
          </button>
          <p>
            <span>{current.label}</span>
            {stage === 2 && changed ? 'Restore the contract to continue to runtime.' : current.summary}
          </p>
          <button disabled={stage === 3 || (stage === 2 && changed)} onClick={() => goToStage(stage + 1)} type="button">
            Next concept →
          </button>
        </footer>
      </section>
      {stage === 3 ? (
        <TransportInspector
          enabled={!changed && (pending || rows.length > 0 || Boolean(error))}
          method="GET"
          path="/api/tasks"
        />
      ) : null}
    </div>
  )
}

function LatencyControl({ latency, onChange }: { latency: number; onChange: (value: number) => void }) {
  return (
    <label className="latency-control">
      <span>
        Artificial backend latency <b>{latency} ms</b>
      </span>
      <input
        type="range"
        min="0"
        max="2400"
        step="100"
        value={latency}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      />
    </label>
  )
}

function CacheLab({
  latency,
  state,
  elapsed,
  pending,
  rows,
  onLatency,
  onRead,
  onClear,
}: {
  latency: number
  state: 'idle' | 'cache' | 'network'
  elapsed: number | null
  pending: boolean
  rows: readonly TaskView[]
  onLatency: (value: number) => void
  onRead: () => void
  onClear: () => void
}) {
  const loaded = state !== 'idle' && !pending
  const source = state === 'cache' ? 'CACHE HIT' : state === 'network' && !pending ? 'SERVER RESPONSE' : 'NO DATA YET'
  const phase = pending ? 'request' : state
  const inspector =
    phase === 'idle'
      ? {
          step: '01 / 02',
          eyebrow: 'Cache is empty',
          title: 'Open the board for the first time.',
          detail: `The component will check memory first, find nothing, then wait ${latency} ms for the backend.`,
          action: 'Open task board',
          hint: 'This run will use the network',
        }
      : phase === 'request'
        ? {
            step: '01 / 02',
            eyebrow: 'Request in flight',
            title: 'The network is now the bottleneck.',
            detail: `The UI has no Task[] to render until GET /api/tasks returns. Watch the same board fill in when it arrives.`,
            action: 'Waiting for server',
            hint: `${latency} ms artificial delay`,
          }
        : phase === 'network'
          ? {
              step: '02 / 02',
              eyebrow: 'Cache is now warm',
              title: 'Open the exact same board again.',
              detail:
                'The first response populated the screen and the query cache. This time memory can answer before HTTP.',
              action: 'Open it again',
              hint: 'No network request this time',
            }
          : {
              step: 'Complete',
              eyebrow: 'Cache hit',
              title: 'Same data. No network wait.',
              detail:
                'The component received fresh Task[] directly from the browser cache, so the network path was skipped.',
              action: 'Replay cache hit',
              hint: 'Still zero HTTP requests',
            }

  return (
    <div className="data-flow-lab">
      <header className="cache-lab-header">
        <div>
          <p className="micro-label">Interactive cache lab</p>
          <h2>Open one app twice. See who answers.</h2>
          <p>Use the highlighted control inside the demo. The inspector will follow the data.</p>
        </div>
        <LatencyControl latency={latency} onChange={onLatency} />
      </header>

      <section
        className={`cache-demo-app cache-showcase-${state} ${pending ? 'is-loading' : ''}`}
        aria-label="Interactive task board cache demonstration"
      >
        <header>
          <div className="cache-window-title">
            <i aria-hidden="true" />
            <span>DEMO / TASKS</span>
          </div>
          <div className="cache-window-actions">
            <b>{pending ? `SERVER · ${latency} MS` : source}</b>
            {state !== 'idle' ? (
              <button className="cache-reset" onClick={onClear} type="button">
                Reset cache
              </button>
            ) : null}
          </div>
        </header>

        <div className="cache-app-shell">
          <div className="cache-board">
            <div className="cache-app-title">
              <div>
                <small>MONDAY, 13 JULY</small>
                <strong>Ship week.</strong>
              </div>
              <span>{loaded ? `${rows.length} tasks` : 'Task board'}</span>
            </div>
            <div className="cache-app-content" aria-live="polite">
              {pending ? (
                <div className="cache-skeleton" aria-label="Waiting for server response">
                  <i />
                  <i />
                  <i />
                  <strong>Waiting for GET /api/tasks…</strong>
                </div>
              ) : loaded ? (
                <ul key={state}>
                  {rows.slice(0, 3).map((task, index) => (
                    <li
                      className={task.completed ? 'done' : ''}
                      key={task.id}
                      style={{ '--task-index': index } as CSSProperties}
                    >
                      <i>{task.completed ? '✓' : ''}</i>
                      <span>{task.title}</span>
                      <small>{task.priority}</small>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="cache-empty-screen">
                  <i>↗</i>
                  <strong>The board has not asked for tasks yet.</strong>
                  <small>Use the highlighted button in the inspector to begin.</small>
                </div>
              )}
            </div>
            <footer>
              <span>
                {state === 'cache' ? 'Rendered immediately from fresh memory' : 'useQuery asks the cache before HTTP'}
              </span>
              <strong>{elapsed == null ? '—' : `${elapsed} ms`}</strong>
            </footer>
          </div>

          <aside className={`cache-inspector phase-${phase}`} aria-live="polite">
            <div className="cache-inspector-progress">
              <span>LIVE INSPECTOR</span>
              <b>{inspector.step}</b>
            </div>

            <div className="cache-inspector-copy" key={phase}>
              <div className="cache-state-icon" aria-hidden="true">
                {phase === 'request' ? <i /> : state === 'cache' ? '✓' : state === 'network' ? '↗' : '○'}
              </div>
              <span>{inspector.eyebrow}</span>
              <h3>{inspector.title}</h3>
              <p>{inspector.detail}</p>
            </div>

            <ol className="cache-signal-path" aria-label="Current data path">
              <li className={phase === 'idle' ? 'active' : 'passed'}>
                <i>1</i>
                <div>
                  <strong>Task board</strong>
                  <small>asks for Task[]</small>
                </div>
              </li>
              <li className={state === 'cache' ? 'passed active' : phase === 'idle' ? '' : 'passed'}>
                <i>2</i>
                <div>
                  <strong>Query cache</strong>
                  <small>
                    {state === 'idle' || pending
                      ? 'no data found'
                      : state === 'network'
                        ? 'Task[] stored'
                        : 'fresh Task[] found'}
                  </small>
                </div>
              </li>
              <li className={pending ? 'active' : state === 'network' ? 'passed' : state === 'cache' ? 'skipped' : ''}>
                <i>3</i>
                <div>
                  <strong>Network</strong>
                  <small>
                    {pending
                      ? `GET /api/tasks · ${latency} ms`
                      : state === 'network'
                        ? 'response received'
                        : state === 'cache'
                          ? 'skipped'
                          : 'used only on a miss'}
                  </small>
                </div>
              </li>
            </ol>

            <div className="cache-primary-action">
              <button aria-label={inspector.action} onClick={onRead} disabled={pending} type="button">
                <span>{pending ? <i /> : inspector.action}</span>
                <b aria-hidden="true">→</b>
              </button>
              <small>{inspector.hint}</small>
            </div>
          </aside>
        </div>
      </section>
    </div>
  )
}

function LocalFirstLab({
  latency,
  onLatency,
  tasks,
}: {
  latency: number
  onLatency: (value: number) => void
  tasks: readonly TaskView[]
}) {
  const queryTarget = tasks.find((task) => task.id === 'optimistic-ui') ?? tasks.find((task) => !task.completed)
  const dbTarget =
    tasks.find((task) => task.id === 'delete-boilerplate') ??
    tasks.find((task) => task.id !== queryTarget?.id && !task.completed)
  const [queryCompleted, setQueryCompleted] = useState<boolean | null>(null)
  const [queryPending, setQueryPending] = useState(false)
  const [queryElapsed, setQueryElapsed] = useState<number | null>(null)
  const [queryHasRun, setQueryHasRun] = useState(false)
  const [queryError, setQueryError] = useState<string | null>(null)
  const [dbPending, setDbPending] = useState(false)
  const [dbElapsed, setDbElapsed] = useState<number | null>(null)
  const [dbLocalElapsed, setDbLocalElapsed] = useState<number | null>(null)
  const [dbHasRun, setDbHasRun] = useState(false)
  const [dbError, setDbError] = useState<string | null>(null)
  const [stage, setStage] = useState<'problem' | 'interface' | 'sync'>('problem')
  const queryVisualCompleted = queryCompleted ?? queryTarget?.completed ?? false
  const stageIndex = stage === 'problem' ? 0 : stage === 'interface' ? 1 : 2

  async function runQueryMutation() {
    if (!queryTarget || queryPending) return
    const started = performance.now()
    const nextCompleted = !queryVisualCompleted
    setQueryPending(true)
    setQueryElapsed(null)
    setQueryError(null)
    try {
      await client.tasks.update(queryTarget.id, { completed: nextCompleted })
      setQueryCompleted(nextCompleted)
      setQueryElapsed(Math.round(performance.now() - started))
      setQueryHasRun(true)
    } catch (reason) {
      setQueryError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setQueryPending(false)
    }
  }

  function runDbMutation() {
    if (!dbTarget || dbPending || !queryHasRun) return
    const started = performance.now()
    setDbPending(true)
    setDbElapsed(null)
    setDbError(null)
    const transaction = taskCollection.update(dbTarget.id, (draft) => {
      draft.completed = !dbTarget.completed
    })
    setDbLocalElapsed(Math.max(1, Math.round(performance.now() - started)))
    setDbHasRun(true)
    void transaction.isPersisted.promise
      .then(() => setDbElapsed(Math.round(performance.now() - started)))
      .catch((reason: unknown) => setDbError(reason instanceof Error ? reason.message : String(reason)))
      .finally(() => setDbPending(false))
  }

  function handleQueryAction() {
    if (queryHasRun) {
      setStage('interface')
      return
    }
    void runQueryMutation()
  }

  function handleDbAction() {
    if (dbHasRun && !dbPending) {
      setStage('sync')
      return
    }
    runDbMutation()
  }

  return (
    <div className={`local-first-lab db-comparison-lab stage-${stage}`}>
      <header>
        <div>
          <p className="micro-label">One comparison / three focused steps</p>
          <h2>
            {stage === 'problem'
              ? 'A cached read does not make this write instant.'
              : stage === 'interface'
                ? 'Now let the interface move on the local clock.'
                : 'One generated contract closes the loop.'}
          </h2>
        </div>
        {stage === 'sync' ? (
          <div className="contract-status">
            <span>CONTRACT STATUS</span>
            <strong>GENERATED + TYPE-SAFE</strong>
          </div>
        ) : (
          <LatencyControl latency={latency} onChange={onLatency} />
        )}
      </header>

      <nav className="db-walkthrough" aria-label="Local-first walkthrough">
        {[
          ['01', 'Feel the wait', 'The server owns when the UI may change.'],
          ['02', 'Move the UI', 'The local collection updates immediately.'],
          ['03', 'Trace the contract', 'Typed persistence reconciles server truth.'],
        ].map(([number, label, detail], index) => {
          const unlocked = index === 0 || (index === 1 && queryHasRun) || (index === 2 && dbHasRun && !dbPending)
          const target = index === 0 ? 'problem' : index === 1 ? 'interface' : 'sync'
          return (
            <button
              aria-current={stageIndex === index ? 'step' : undefined}
              className={`${stageIndex === index ? 'active' : ''} ${stageIndex > index ? 'complete' : ''}`}
              disabled={!unlocked}
              key={number}
              onClick={() => setStage(target as typeof stage)}
              type="button"
            >
              <span>{stageIndex > index ? '✓' : number}</span>
              <strong>{label}</strong>
              <small>{detail}</small>
            </button>
          )
        })}
      </nav>

      {stage === 'sync' ? (
        <SyncContractStage pending={dbPending} settled={dbHasRun && !dbPending} />
      ) : (
        <div className={`mutation-comparison focus-${stage}`}>
          <article
            aria-label={stage === 'problem' ? 'Current focus: server-first mutation' : 'Server-first comparison'}
            className={`mutation-app query-only ${queryPending ? 'is-waiting' : ''}`}
          >
            <header>
              <div>
                <span>01 / QUERY CACHE ONLY</span>
                <strong>Cached read. Server-first write.</strong>
              </div>
              <b>{queryPending ? 'PATCH IN FLIGHT' : queryHasRun ? 'SERVER APPLIED' : 'CACHE READY'}</b>
            </header>
            <div className="mutation-app-screen">
              <div className="mutation-app-heading">
                <small>TODAY / SHIP WEEK</small>
                <strong>My tasks</strong>
                <span>Task[] was already cached</span>
              </div>
              <div className={`mutation-task-row ${queryVisualCompleted ? 'done' : ''}`}>
                <i>{queryVisualCompleted ? '✓' : ''}</i>
                <div>
                  <strong>{queryTarget?.title ?? 'Loading cached task…'}</strong>
                  <small>{queryPending ? 'The cached row cannot confirm this write yet' : 'medium priority'}</small>
                </div>
                <b>{queryPending ? '…' : queryVisualCompleted ? 'DONE' : 'OPEN'}</b>
              </div>
            </div>
            <button disabled={!queryTarget || queryPending} onClick={handleQueryAction}>
              <span>{queryPending ? 'WAITING' : queryHasRun ? 'NEXT' : 'TRY IT'}</span>
              <strong>
                {queryPending
                  ? `UI waits for the ${latency} ms server`
                  : queryHasRun
                    ? 'Now let the interface change first'
                    : 'Complete with the cached query'}
              </strong>
              <b>→</b>
            </button>
            <div className="mutation-timeline">
              <span>CLICK</span>
              <i className={queryPending ? 'travelling' : ''} />
              <span>SERVER</span>
              <i className={queryPending ? 'travelling return' : ''} />
              <span>UI</span>
            </div>
            <footer>
              <span>
                {queryPending
                  ? 'Checkbox stays unchanged'
                  : queryHasRun
                    ? 'Changed after acknowledgement'
                    : 'Read was instant'}
              </span>
              <strong>
                {queryPending ? `${latency} ms…` : queryElapsed == null ? '0 ms read' : `${queryElapsed} ms`}
              </strong>
            </footer>
            {queryError ? <div className="error-note">{queryError}</div> : null}
          </article>

          <article
            aria-label={stage === 'interface' ? 'Current focus: local-first interface' : 'Local-first comparison'}
            className={`mutation-app db-first ${dbPending ? 'is-syncing' : ''}`}
          >
            <header>
              <div>
                <span>02 / TANSTACK DB</span>
                <strong>Local-first write. Background sync.</strong>
              </div>
              <b>{dbPending ? 'SYNCING' : dbHasRun ? 'RECONCILED' : queryHasRun ? 'READY TO TRY' : 'RUN STEP 01'}</b>
            </header>
            <div className="mutation-app-screen">
              <div className="mutation-app-heading">
                <small>TODAY / SHIP WEEK</small>
                <strong>My tasks</strong>
                <span>Live collection drives the UI</span>
              </div>
              <div className={`mutation-task-row ${dbTarget?.completed ? 'done' : ''}`}>
                <i>{dbTarget?.completed ? '✓' : ''}</i>
                <div>
                  <strong>{dbTarget?.title ?? 'Hydrating live collection…'}</strong>
                  <small>{dbPending ? 'Optimistic row stays visible through PATCH + refetch' : 'low priority'}</small>
                </div>
                <b>{dbPending ? 'LOCAL' : dbTarget?.completed ? 'DONE' : 'OPEN'}</b>
              </div>
            </div>
            <button disabled={!dbTarget || dbPending || !queryHasRun} onClick={handleDbAction}>
              <span>{dbPending ? 'SYNCING' : dbHasRun ? 'NEXT' : queryHasRun ? 'TRY IT' : 'LOCKED'}</span>
              <strong>
                {dbPending
                  ? `UI changed in ${dbLocalElapsed ?? 1} ms; the server continues behind it`
                  : dbHasRun
                    ? 'See how the generated contract keeps it synced'
                    : 'Complete immediately with TanStack DB'}
              </strong>
              <b>→</b>
            </button>
            <div className={`local-ui-proof ${dbHasRun ? 'is-visible' : ''}`} aria-live="polite">
              <span>UI CLOCK</span>
              <strong>{dbHasRun ? `${dbLocalElapsed ?? 1} ms` : 'READY'}</strong>
              <small>
                {dbPending
                  ? 'The checkbox is already rendered. Persistence is still running.'
                  : dbHasRun
                    ? 'The interface never waited for the round trip.'
                    : 'This time, watch the checkbox—not the network.'}
              </small>
            </div>
            <footer>
              <span>
                {dbPending
                  ? 'Optimistic locally / mutation + refetch in background'
                  : dbHasRun
                    ? 'Fresh server truth reconciled'
                    : 'Local write is next'}
              </span>
              <strong>
                {dbPending
                  ? `${dbLocalElapsed ?? 1} ms UI`
                  : dbElapsed == null
                    ? '—'
                    : `${dbLocalElapsed ?? 1} ms UI / ${dbElapsed} ms reconcile`}
              </strong>
            </footer>
            {dbError ? <div className="error-note">{dbError}</div> : null}
          </article>
        </div>
      )}
    </div>
  )
}

function SyncContractStage({ pending, settled }: { pending: boolean; settled: boolean }) {
  return (
    <section className="sync-contract-stage">
      <header>
        <div>
          <span>03 / UNDER THE INTERFACE</span>
          <h3>The UI only touches the collection. The adapter handles the round trip.</h3>
        </div>
        <p>
          The generated <code>client.tasks</code> client gives the sync engine its read and mutation types, so every
          optimistic write is persisted, refetched, and reconciled against server truth.
        </p>
      </header>

      <div className="sync-contract-grid">
        <div className="sync-diagram-frame">
          <div className="sync-frame-label">
            <span>RUNTIME LOOP</span>
            <b>LOCAL NOW / SERVER IN BACKGROUND</b>
          </div>
          <SyncEngineMap pending={pending} settled={settled} />
        </div>

        <div className="generated-contract-card">
          <header>
            <span>BUILD-TIME CONTRACT</span>
            <b>tasks.db.ts</b>
          </header>
          <div
            className="contract-source-chain"
            aria-label="Backend route generates client types used by the database adapter"
          >
            <span>BACKEND ROUTES</span>
            <b>→</b>
            <span>GENERATED CLIENT</span>
            <b>→</b>
            <span>DB ADAPTER</span>
          </div>
          <pre>
            <code>{`const client = createClient({
  queryClient,
  collections: {
    tasks: { refetch: true },
  },
})

const tasks = client.tasks.$tanstack.collection
`}</code>
          </pre>
          <p>
            Change a backend input or result and TypeScript marks the adapter before the app ships. At runtime, only
            plain HTTP crosses the network.
          </p>
        </div>
      </div>

      <div className={`reconciliation-receipt ${pending ? 'syncing' : settled ? 'settled' : ''}`}>
        <div>
          <span>ONE LOOP / TWO CLOCKS</span>
          <strong>Immediate locally. Authoritative eventually. Typed throughout.</strong>
        </div>
        <ol>
          <li className="active">
            <span>01</span>
            <strong>Mutate collection</strong>
            <small>Live queries rerender synchronously</small>
          </li>
          <li className={pending || settled ? 'active' : ''}>
            <span>02</span>
            <strong>Persist + refetch</strong>
            <small>Typed PATCH followed by fresh Task[]</small>
          </li>
          <li className={settled ? 'active' : ''}>
            <span>03</span>
            <strong>Reconcile server truth</strong>
            <small>The collection settles without a UI jump</small>
          </li>
        </ol>
      </div>
    </section>
  )
}

function SyncEngineMap({ pending, settled }: { pending: boolean; settled: boolean }) {
  return (
    <div
      className={`sync-engine-map ${pending ? 'is-syncing' : ''} ${settled ? 'is-settled' : ''}`}
      aria-label="The UI and TanStack DB collection live in the client. The sync engine persists changes to the server, refetches server state, and reconciles it into the collection."
    >
      <section className="sync-client-boundary">
        <header>
          <span>
            <SyncMapIcon name="client" /> CLIENT
          </span>
          <b>UI LIVES HERE</b>
        </header>

        <div className="sync-local-loop">
          <div className="sync-map-node sync-ui-node">
            <SyncMapIcon name="ui" />
            <span>
              <strong>UI</strong>
              <small>Live query</small>
            </span>
          </div>

          <div className="sync-local-arrows" aria-hidden="true">
            <span>render ↑</span>
            <i />
            <span>↓ update</span>
          </div>

          <div className="sync-map-node sync-collection-node">
            <SyncMapIcon name="collection" />
            <span>
              <strong>Local collection</strong>
              <small>Optimistic state</small>
            </span>
          </div>
        </div>

        <div className="sync-adapter-node">
          <SyncMapIcon name="sync" />
          <span>
            <strong>Sync engine</strong>
            <small>persist · refetch · reconcile</small>
          </span>
        </div>
      </section>

      <div className="sync-transport" aria-hidden="true">
        <div className="sync-request-path">
          <span>PATCH</span>
          <i />
          <b>→</b>
        </div>
        <div className="sync-response-path">
          <b>←</b>
          <i />
          <span>FRESH TASK[]</span>
        </div>
      </div>

      <section className="sync-server-node">
        <SyncMapIcon name="server" />
        <span>
          <small>AUTHORITATIVE</small>
          <strong>Server</strong>
          <b>{pending ? 'SYNCING' : settled ? 'CONFIRMED' : 'WAITING'}</b>
        </span>
      </section>
    </div>
  )
}

function SyncMapIcon({ name }: { name: 'client' | 'ui' | 'collection' | 'sync' | 'server' }) {
  if (name === 'client') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="4" width="18" height="13" rx="1.5" />
        <path d="M8 21h8M12 17v4" />
      </svg>
    )
  }

  if (name === 'ui') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M3 8h18M7 6h.01M10 6h.01" />
      </svg>
    )
  }

  if (name === 'collection') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <ellipse cx="12" cy="5" rx="8" ry="3" />
        <path d="M4 5v6c0 1.66 3.58 3 8 3s8-1.34 8-3V5M4 11v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6" />
      </svg>
    )
  }

  if (name === 'sync') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M20 7h-6V1M4 17h6v6M19 12a7 7 0 0 0-12-5l-3 3M5 12a7 7 0 0 0 12 5l3-3" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="3" width="16" height="7" rx="1" />
      <rect x="4" y="14" width="16" height="7" rx="1" />
      <path d="M8 6.5h.01M8 17.5h.01M12 6.5h5M12 17.5h5" />
    </svg>
  )
}
