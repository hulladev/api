import { createApiHandler } from '@hulla/api/server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { contracts, routers } from '../../web/src/api/generated/server'

const contract = contracts.routes
const generated = createApiHandler({ routers, contract })

export const app = new Hono()

app.use(
  `${contract.basePath}/*`,
  cors({
    origin: 'http://localhost:3000',
    allowHeaders: ['Content-Type'],
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  })
)
app.get('/health', (context) => context.json({ service: 'interactive-demo', status: 'ready' }))
app.all(`${contract.basePath}/*`, (context) => generated.fetch(context.req.raw))

export default {
  port: Number(Bun.env.PORT ?? 3001),
  fetch: app.fetch,
}
