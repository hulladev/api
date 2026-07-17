import { z } from 'zod'
import { createTask, deleteTask, listTasks, updateTask } from '../store'
import { api } from './base'

const priority = z.enum(['low', 'medium', 'high'])
const task = z.object({
  id: z.string(),
  title: z.string(),
  priority,
  completed: z.boolean(),
  createdAt: z.string(),
})

export const tasks = api.router('tasks').define(({ route }) => ({
  list: route('GET', '/')
    .output(z.array(task))
    .handler(() => listTasks()),

  create: route('POST', '/')
    .input(z.object({ title: z.string().trim().min(2).max(80), priority }))
    .output(task)
    .handler(({ input }) => createTask(input)),

  update: route('PATCH', '/:id')
    .input(
      z.string(),
      z.object({
        title: z.string().trim().min(2).max(80).optional(),
        priority: priority.optional(),
        completed: z.boolean().optional(),
      })
    )
    .output(task)
    .handler(({ input: [id, changes] }) => updateTask(id, changes)),

  delete: route('DELETE', '/:id')
    .input(z.string())
    .output(task)
    .handler(({ input }) => deleteTask(input)),
}))
