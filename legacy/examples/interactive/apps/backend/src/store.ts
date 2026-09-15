export type Task = {
  id: string
  title: string
  priority: 'low' | 'medium' | 'high'
  completed: boolean
  createdAt: string
}

let tasksSeedIndex = 0

const tasks = new Map<string, Task>([
  seed('contract-map', 'Map the generated contract', 'high', true),
  seed('optimistic-ui', 'Try an optimistic update', 'medium', false),
  seed('delete-boilerplate', 'Delete transport boilerplate', 'low', false),
])

export function listTasks(): Task[] {
  return [...tasks.values()].sort((left, right) => left.createdAt.localeCompare(right.createdAt))
}

export function createTask(input: Pick<Task, 'title' | 'priority'>): Task {
  const task: Task = {
    id: crypto.randomUUID(),
    title: input.title,
    priority: input.priority,
    completed: false,
    createdAt: new Date().toISOString(),
  }
  tasks.set(task.id, task)
  return task
}

export function updateTask(id: string, changes: Partial<Pick<Task, 'title' | 'priority' | 'completed'>>): Task {
  const task = tasks.get(id)
  if (!task) throw new Error(`Task ${id} was not found.`)
  const updated = { ...task, ...changes }
  tasks.set(id, updated)
  return updated
}

export function deleteTask(id: string): Task {
  const task = tasks.get(id)
  if (!task) throw new Error(`Task ${id} was not found.`)
  tasks.delete(id)
  return task
}

function seed(id: string, title: string, priority: Task['priority'], completed: boolean): [string, Task] {
  return [
    id,
    {
      id,
      title,
      priority,
      completed,
      createdAt: `2026-07-13T09:0${tasksSeedIndex++}:00.000Z`,
    },
  ]
}
