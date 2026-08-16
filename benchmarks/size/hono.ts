import { Hono } from 'hono'
import { hc } from 'hono/client'
import { z } from 'zod'

const output = z.object({ ok: z.boolean() })
const app = new Hono().get('/health', (context) => context.json(output.parse({ ok: true })))
const fetcher: typeof globalThis.fetch = async (input, init) => app.fetch(new Request(input, init))

export const client = hc<typeof app>('https://size.local', { fetch: fetcher })
