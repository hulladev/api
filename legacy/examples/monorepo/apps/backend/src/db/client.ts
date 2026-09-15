import { Database } from 'bun:sqlite'
import { resolve } from 'node:path'
import { drizzle } from 'drizzle-orm/bun-sqlite'

const sqlite = new Database(resolve(import.meta.dir, '../../fitness.sqlite'), {
  create: true,
})

sqlite.run('PRAGMA journal_mode = WAL')
sqlite.run(`
  CREATE TABLE IF NOT EXISTS workouts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    focus TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0
  )
`)

const count = sqlite.query<{ count: number }, []>('SELECT COUNT(*) AS count FROM workouts').get()?.count ?? 0

if (count === 0) {
  const insert = sqlite.prepare('INSERT INTO workouts (id, name, focus, completed) VALUES (?, ?, ?, ?)')

  insert.run(crypto.randomUUID(), 'Heavy compound lifts', 'Strength', 1)
  insert.run(crypto.randomUUID(), 'Zone 2 engine work', 'Conditioning', 0)
  insert.run(crypto.randomUUID(), 'Hips and shoulders reset', 'Mobility', 0)
}

export const db = drizzle({ client: sqlite })
