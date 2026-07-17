import { useLiveQuery } from '@tanstack/react-db'
import { createFileRoute } from '@tanstack/react-router'
import { useMemo, useState, type FormEvent } from 'react'
import { client } from '../data'

export const Route = createFileRoute('/')({
  component: FitnessPage,
})

const focusOptions = ['Strength', 'Conditioning', 'Mobility', 'Recovery'] as const

function FitnessPage() {
  const workouts = useLiveQuery((query) => query.from({ workouts: client.workouts.$tanstack.collection }))
  const [name, setName] = useState('')
  const [focus, setFocus] = useState<(typeof focusOptions)[number]>('Strength')
  const [pendingMutations, setPendingMutations] = useState(0)
  const [mutationError, setMutationError] = useState<Error | null>(null)
  const queryError = client.workouts.$tanstack.collection.utils.lastError
  const isMutating = pendingMutations > 0

  function persist(promise: Promise<unknown>, onSuccess?: () => void) {
    setPendingMutations((count) => count + 1)
    setMutationError(null)
    void promise
      .then(onSuccess)
      .catch((error: unknown) => setMutationError(toError(error)))
      .finally(() => setPendingMutations((count) => count - 1))
  }

  const summary = useMemo(() => {
    const data = workouts.data ?? []
    return {
      completed: data.filter((workout) => workout.completed).length,
      remaining: data.filter((workout) => !workout.completed).length,
      total: data.length,
    }
  }, [workouts.data])

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (name.trim().length < 2 || isMutating) return
    persist(client.workouts.create({ name: name.trim(), focus }), () => setName(''))
  }

  return (
    <main className="shell">
      <header className="masthead">
        <a className="wordmark" href="/" aria-label="Form Function home">
          <span>FORM</span>
          <span className="wordmark-slash">/</span>
          <span>FUNCTION</span>
        </a>
        <div className="api-state">
          <span className="pulse" aria-hidden="true" />
          Hono · Drizzle · Hulla
        </div>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Training log · Week 28</p>
          <h1>
            Show up.
            <br />
            Write it down.
          </h1>
          <p className="lede">
            A deliberately small training surface for testing one generated contract from SQLite to the browser.
          </p>
        </div>
        <div className="hero-mark" aria-hidden="true">
          <span>28</span>
          <small>JUL</small>
        </div>
      </section>

      <section className="metrics" aria-label="Training summary">
        <Metric value={`${summary.completed}/${summary.total}`} label="Sessions closed" />
        <Metric value={`${summary.remaining}`} label="Sessions open" />
        <Metric
          value={summary.total === 0 ? '0%' : `${Math.round((summary.completed / summary.total) * 100)}%`}
          label="Completion"
        />
      </section>

      <section className="workspace">
        <div className="panel plan-panel">
          <div className="section-heading">
            <p>01 / Plan</p>
            <h2>Add the next session</h2>
          </div>
          <form onSubmit={submit} className="workout-form">
            <label className="field field-wide">
              <span>Session name</span>
              <input
                value={name}
                onChange={(event) => setName(event.currentTarget.value)}
                placeholder="e.g. Tempo intervals"
                minLength={2}
                maxLength={80}
                required
              />
            </label>
            <label className="field">
              <span>Focus</span>
              <select value={focus} onChange={(event) => setFocus(event.currentTarget.value as typeof focus)}>
                {focusOptions.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </label>
            <button className="add-button" type="submit" disabled={isMutating}>
              <span>{isMutating ? 'Writing…' : 'Add session'}</span>
              <span aria-hidden="true">↗</span>
            </button>
          </form>
          {mutationError ? <p className="error-note">{mutationError.message}</p> : null}
        </div>

        <div className="panel log-panel">
          <div className="section-heading log-heading">
            <div>
              <p>02 / Log</p>
              <h2>This week</h2>
            </div>
            <span className="count">{String(summary.total).padStart(2, '0')}</span>
          </div>

          {workouts.isLoading ? <p className="empty-state">Loading the contract…</p> : null}
          {workouts.isError && queryError ? <p className="error-note">{toError(queryError).message}</p> : null}
          {!workouts.isLoading && summary.total === 0 ? (
            <p className="empty-state">No sessions yet. Start on the left.</p>
          ) : null}

          <ol className="workout-list">
            {(workouts.data ?? []).map((workout, index) => (
              <li className={workout.completed ? 'workout completed' : 'workout'} key={workout.id}>
                <button
                  className="check"
                  type="button"
                  aria-label={workout.completed ? `Reopen ${workout.name}` : `Complete ${workout.name}`}
                  disabled={isMutating}
                  onClick={() =>
                    persist(
                      client.workouts.update(workout.id, {
                        completed: !workout.completed,
                      })
                    )
                  }
                >
                  {workout.completed ? '✓' : String(index + 1).padStart(2, '0')}
                </button>
                <div className="workout-copy">
                  <strong>{workout.name}</strong>
                  <span>{workout.focus} · programmed session</span>
                </div>
                <button
                  className="delete"
                  type="button"
                  disabled={isMutating}
                  onClick={() => persist(client.workouts.delete(workout.id))}
                  aria-label={`Delete ${workout.name}`}
                >
                  ×
                </button>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <footer>
        <span>Local contract test</span>
        <span>TanStack Start / port 3000</span>
      </footer>
    </main>
  )
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <div className="metric">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  )
}
