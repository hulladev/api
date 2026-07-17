import { contracts, createDrizzleRouters } from '@fitness/api-client/server'
import { createApi } from '@hulla/api'
import { drizzlePlugin } from '@hulla/api-drizzle'
import { createApiHandler } from '@hulla/api/server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { db } from './db/client'

const api = createApi({ plugins: [drizzlePlugin({ db })] })
const routers = createDrizzleRouters({ api })
const contract = contracts.database
const generated = createApiHandler({
  routers,
  contract,
})

export const app = new Hono()

app.use(logger())
app.use(
  `${contract.basePath}/*`,
  cors({
    origin: ['http://localhost:3000', 'http://localhost:8081'],
    allowHeaders: ['Content-Type'],
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  })
)
app.get('/health', (context) => context.json({ service: 'fitness-backend', status: 'ready' }))
app.all(`${contract.basePath}/*`, (context) => generated.fetch(context.req.raw))

export default {
  port: 3001,
  fetch: app.fetch,
}
