import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import type { LowercaseMethods } from '../src/types'

export const API_URL = 'http://api.com'

export const users = [
  { id: 0, name: 'John' },
  { id: 1, name: 'Jane' },
]

const handlers = [
  http.get(`${API_URL}/users`, () => HttpResponse.json({ users })),
  http.get(`${API_URL}/users/:id`, (req) => HttpResponse.json(users.find((u) => u.id === +req.params['id']))),
  http.post(`${API_URL}/example`, () => HttpResponse.json({ foo: 'bar' })),
]

export const createServer = () => setupServer(...handlers)

export const mockCtx = <const N extends string, const M extends LowercaseMethods, A>(route: N, method: M, args: A) => {
  return { method, routerName: 'aa', route, args, type: 'request' as const }
}
