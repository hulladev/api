import backendBase from '../../backend/src/api/base.ts?raw'
import tasksRouter from '../../backend/src/api/tasks.router.ts?raw'
import store from '../../backend/src/store.ts?raw'
import apiClient from './api/client.ts?raw'
import generatedFetch from './api/generated/fetch.ts?raw'
import generatedIndex from './api/generated/index.ts?raw'
import generatedContract from './api/generated/routes.contract.ts?raw'
import generatedRoutes from './api/generated/routes.ts?raw'

export const editorProjectFiles: readonly (readonly [path: string, source: string])[] = [
  ['apps/backend/src/api/base.ts', backendBase],
  ['apps/backend/src/api/tasks.router.ts', tasksRouter],
  ['apps/backend/src/store.ts', store],
  ['apps/web/src/api/client.ts', apiClient],
  ['apps/web/src/api/generated/fetch.ts', generatedFetch],
  ['apps/web/src/api/generated/index.ts', generatedIndex],
  ['apps/web/src/api/generated/routes.ts', generatedRoutes],
  ['apps/web/src/api/generated/routes.contract.ts', generatedContract],
  [
    'apps/web/src/acme.generated.ts',
    `export type OpenAPIRequest = {
  path: string
  method: string
  body?: unknown
  headers?: Record<string, string>
}

export type ExternalTask = {
  id: string
  title: string
  status: 'backlog' | 'active' | 'done'
}

export type OpenAPIClient = <Result>(request: OpenAPIRequest) => Result | Promise<Result>

export declare function createOpenAPIClient(client: OpenAPIClient): {
  tasks: {
    list: { call(): Promise<ExternalTask[]> }
    byId: { call(input: { params: { id: string } }): Promise<ExternalTask> }
  }
}`,
  ],
]
