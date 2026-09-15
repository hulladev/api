import type { ResponseHeaderValues } from '../headers'

export function toFetchHeaders(values: ResponseHeaderValues): HeadersInit {
  if (Object.values(values).every((value) => typeof value === 'string')) return values as Record<string, string>
  const headers = new Headers()
  for (const [name, value] of Object.entries(values)) {
    if (typeof value === 'string') headers.set(name, value)
    else for (const item of value) headers.append(name, item)
  }
  return headers
}

export function fromFetchHeaders(headers: Headers): ResponseHeaderValues {
  const values: Record<string, string | readonly string[]> = Object.fromEntries(headers)
  if (headers.has('set-cookie')) values['set-cookie'] = headers.getSetCookie()
  return values
}
