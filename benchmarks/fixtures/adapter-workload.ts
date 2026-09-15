import { z } from 'zod'

export const adapterStaticValue = { ok: true }
export const adapterDynamicValue = { id: 'item-42', name: 'Ada', tag: 'bench' }
export const adapterStaticOutput = z.object({ ok: z.boolean() })
export const adapterDynamicInput = z.object({ id: z.string(), name: z.string(), tag: z.string() })
export const adapterDynamicOutput = z.object({ id: z.string(), name: z.string(), tag: z.string() })
export const adapterDynamicBody = JSON.stringify(adapterDynamicValue)
export const adapterRestDynamicBody = z.object({ name: z.string() })
export const adapterRestDynamicParams = z.object({ id: z.string() })
export const adapterRestDynamicQuery = z.object({ tag: z.string() })
export const adapterRestDynamicBodyJson = JSON.stringify({ name: adapterDynamicValue.name })

export function adapterRequest(path: string, body?: string): Request {
  return new Request(`https://bench.local${path}`, {
    ...(body === undefined
      ? {}
      : {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body,
        }),
  })
}

export async function directAdapterHandler(request: Request): Promise<Response> {
  if (request.method === 'GET') return Response.json(adapterStaticOutput.parse(adapterStaticValue))
  const url = new URL(request.url)
  const params = adapterRestDynamicParams.parse({ id: url.pathname.split('/').at(-1) })
  const query = adapterRestDynamicQuery.parse(Object.fromEntries(url.searchParams))
  const body = adapterRestDynamicBody.parse(await request.json())
  return Response.json(adapterDynamicOutput.parse({ id: params.id, name: body.name, tag: query.tag }), { status: 201 })
}

export async function assertAdapterResponse(result: Response, dynamic: boolean): Promise<void> {
  if (result.status !== (dynamic ? 201 : 200)) throw new Error('Unexpected adapter status')
  const value: unknown = await result.json()
  if (dynamic) {
    const output = adapterDynamicOutput.parse(value)
    if (
      output.id !== adapterDynamicValue.id ||
      output.name !== adapterDynamicValue.name ||
      output.tag !== adapterDynamicValue.tag
    ) {
      throw new Error('Unexpected dynamic adapter result')
    }
  } else if (!adapterStaticOutput.parse(value).ok) throw new Error('Unexpected static adapter result')
}
