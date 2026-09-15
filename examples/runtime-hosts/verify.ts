/** Shared assertions run against native Bun/Deno servers and the built Vercel Web Handler. */
export async function verify(send: (request: Request) => Promise<Response>, origin = 'http://runtime.test') {
  const check = (condition: boolean, message: string) => {
    if (!condition) throw new Error(message)
  }
  const health = await send(new Request(`${origin}/api/health`, { headers: { 'x-actor': 'fixture' } }))
  check(health.status === 200, 'Health status')
  const body = await health.json()
  check(body.ok === true && body.actor === 'fixture', 'Native request context')
  const bytes = new Uint8Array(1_048_577).fill(128)
  bytes[bytes.length - 1] = 255
  const echoed = await send(
    new Request(`${origin}/api/echo`, {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream' },
      body: bytes,
    })
  )
  check(echoed.status === 201, 'No library-imposed body cap')
  const decoded = new Uint8Array(await echoed.arrayBuffer())
  check(decoded.length === bytes.length && decoded[0] === 128 && decoded.at(-1) === 255, 'Byte response integrity')
  check(echoed.headers.getSetCookie().join('|') === 'first=1; Path=/|second=2; Path=/', 'Separate cookies')
  const streamed = await send(new Request(`${origin}/api/stream`))
  check(streamed.status === 200, 'Stream status')
  check([...new Uint8Array(await streamed.arrayBuffer())].join(',') === '0,128,255', 'Stream content')
  const missing = await send(new Request(`${origin}/missing`))
  check(missing.status === 404, 'Missing route status')
  await missing.arrayBuffer()
  const disallowed = await send(new Request(`${origin}/api/health`, { method: 'DELETE' }))
  check(disallowed.status === 405 && disallowed.headers.get('allow') === 'GET', 'Method ownership')
  await disallowed.arrayBuffer()
}
