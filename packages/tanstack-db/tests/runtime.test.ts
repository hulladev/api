import { describe, expect, expectTypeOf, test, vi } from 'vitest'
import { createCollectionRuntime } from '../src'

describe('collection runtime', () => {
  test('creates each collection lazily and keeps a stable instance', () => {
    const cleanup = vi.fn()
    const createTodos = vi.fn(() => ({ cleanup, resource: 'todos' as const }))
    const createUsers = vi.fn(() => ({ cleanup: vi.fn(), resource: 'users' as const }))
    const runtime = createCollectionRuntime({ todos: createTodos, users: createUsers })

    expect(createTodos).not.toHaveBeenCalled()
    expect(createUsers).not.toHaveBeenCalled()
    expect(Object.keys(runtime.collections)).toEqual(['todos', 'users'])

    const first = runtime.collections.todos
    const second = runtime.collections.todos

    expect(first).toBe(second)
    expect(createTodos).toHaveBeenCalledOnce()
    expect(createUsers).not.toHaveBeenCalled()
    expectTypeOf(first.resource).toEqualTypeOf<'todos'>()
  })

  test('cleans up created collections once and rejects access after disposal', () => {
    const todosCleanup = vi.fn()
    const usersCleanup = vi.fn()
    const runtime = createCollectionRuntime({
      todos: () => ({ cleanup: todosCleanup }),
      users: () => ({ cleanup: usersCleanup }),
    })

    void runtime.collections.todos
    runtime.dispose()
    runtime.dispose()

    expect(todosCleanup).toHaveBeenCalledOnce()
    expect(usersCleanup).not.toHaveBeenCalled()
    expect(() => runtime.collections.todos).toThrow('runtime has been disposed')
    expect(() => runtime.collections.users).toThrow('runtime has been disposed')
  })
})
