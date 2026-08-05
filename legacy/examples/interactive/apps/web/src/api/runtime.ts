export type TraceEvent = {
  id: string
  state: 'sending' | 'settled' | 'failed'
  method: string
  path: string
  body: string | null
  status: number | null
  durationMs: number | null
  response: string | null
}

let trace: TraceEvent[] = []
let demoLatencyMs = 0
const listeners = new Set<() => void>()

export function setDemoLatency(value: number) {
  demoLatencyMs = Math.max(0, value)
}

export async function tracedFetch(input: RequestInfo | URL, init?: RequestInit) {
  const request = toRequest(input, init)
  const id = crypto.randomUUID()
  const startedAt = performance.now()
  const body = await request.clone().text()

  publish({
    id,
    state: 'sending',
    method: request.method,
    path: new URL(request.url).pathname,
    body: body || null,
    status: null,
    durationMs: null,
    response: null,
  })

  try {
    if (demoLatencyMs > 0) await new Promise((resolve) => setTimeout(resolve, demoLatencyMs))
    const response = await fetch(request)
    const responseBody = await response.clone().text()
    publish({
      id,
      state: response.ok ? 'settled' : 'failed',
      method: request.method,
      path: new URL(request.url).pathname,
      body: body || null,
      status: response.status,
      durationMs: Number((performance.now() - startedAt).toFixed(1)),
      response: responseBody || null,
    })
    return response
  } catch (error) {
    publish({
      id,
      state: 'failed',
      method: request.method,
      path: new URL(request.url).pathname,
      body: body || null,
      status: null,
      durationMs: Number((performance.now() - startedAt).toFixed(1)),
      response: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}

export function subscribeTrace(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getTraceSnapshot() {
  return trace
}

function publish(event: TraceEvent) {
  trace = [event, ...trace.filter((item) => item.id !== event.id)].slice(0, 12)
  for (const listener of listeners) listener()
}

function toRequest(input: RequestInfo | URL, init?: RequestInit) {
  if (input instanceof Request) return input.clone()
  return new Request(new URL(String(input), window.location.origin), init)
}
