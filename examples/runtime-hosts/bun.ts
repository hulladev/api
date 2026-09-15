import { handler } from './server'

export const server = Bun.serve({ hostname: '127.0.0.1', port: Number(Bun.env['PORT'] ?? 3000), fetch: handler })
console.log(`Listening on ${server.url}`)
