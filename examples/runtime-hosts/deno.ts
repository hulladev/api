import { handler } from './server.ts'

export const server = Deno.serve({ hostname: '127.0.0.1', port: Number(Deno.env.get('PORT') ?? 3000) }, handler)
