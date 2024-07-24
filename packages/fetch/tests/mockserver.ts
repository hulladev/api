import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'

export const API_URL = 'https://api.com'

export const users = [
  { id: 0, name: 'John' },
  { id: 1, name: 'Jane' },
  { id: 2, name: 'Alice' },
] satisfies User[]

export type User = { id: number; name: string }

const handlers = [
  http.get(`${API_URL}/users`, () => HttpResponse.json({ users })),
  http.get(`${API_URL}/users/:id`, (req) => HttpResponse.json(users.find((u) => u.id === +req.params['id']))),
  http.post(`${API_URL}/users`, () => HttpResponse.json({ id: 4, name: 'Bob' })),
]

export const createServer = () => setupServer(...handlers)
