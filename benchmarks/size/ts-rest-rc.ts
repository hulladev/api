import { initClient, initContract } from '@ts-rest/core-rc'
import { z } from 'zod'

const output = z.object({ ok: z.boolean() })
const c = initContract()
const contract = c.router({
  health: {
    method: 'GET',
    path: '/health',
    responses: { 200: output },
  },
})
const api = async () => ({ status: 200 as const, headers: new Headers(), body: { ok: true } })

export const client = initClient(contract, { baseUrl: 'https://size.local', api, validateResponse: true })
