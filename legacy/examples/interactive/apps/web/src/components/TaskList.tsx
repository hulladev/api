import type { ReactNode } from 'react'

export type TaskView = {
  id: string
  title: string
  priority: 'low' | 'medium' | 'high'
  completed: boolean
}

export function TaskList({
  tasks,
  onToggle,
  onDelete,
  pending,
  empty,
}: {
  tasks: readonly TaskView[]
  onToggle: (task: TaskView) => void
  onDelete: (task: TaskView) => void
  pending?: boolean
  empty?: ReactNode
}) {
  if (tasks.length === 0) return <div className="empty-board">{empty ?? 'No tasks on the wire.'}</div>

  return (
    <ol className={pending ? 'task-list pending' : 'task-list'}>
      {tasks.map((task) => (
        <li key={task.id} className={task.completed ? 'task done' : 'task'}>
          <button className="task-check" type="button" onClick={() => onToggle(task)}>
            {task.completed ? '✓' : ''}
          </button>
          <div>
            <strong>{task.title}</strong>
            <span>{task.priority} priority</span>
          </div>
          <button
            className="task-delete"
            type="button"
            onClick={() => onDelete(task)}
            aria-label={`Delete ${task.title}`}
          >
            ×
          </button>
        </li>
      ))}
    </ol>
  )
}
