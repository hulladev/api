import { defineTable } from '@hulla/api-drizzle'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { createInsertSchema, createUpdateSchema } from 'drizzle-orm/zod'

const workoutFocuses = ['Strength', 'Conditioning', 'Mobility', 'Recovery'] as const

export const workouts = sqliteTable('workouts', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull(),
  focus: text('focus', { enum: workoutFocuses }).notNull(),
  completed: integer('completed', { mode: 'boolean' }).notNull().default(false),
})

export const createWorkoutSchema = createInsertSchema(workouts, {
  name: (schema) => schema.trim().min(2).max(80),
}).omit({ id: true })

export const updateWorkoutSchema = createUpdateSchema(workouts, {
  name: (schema) => schema.trim().min(2).max(80),
})
  .omit({ id: true })
  .refine((value) => Object.keys(value).length > 0, 'Update at least one field.')

export const workoutsTable = defineTable(workouts, {
  schemas: {
    insert: createWorkoutSchema,
    update: updateWorkoutSchema,
  },
})
