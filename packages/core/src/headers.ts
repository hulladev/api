import { isRecord, setOwn } from './object'

/** Repeated values remain separate, particularly Set-Cookie. Names are normalized at the boundary. */
export type ResponseHeaderValues = Readonly<Record<string, string | readonly string[]>>

export function normalizeResponseHeaders(value: unknown): ResponseHeaderValues {
  if (value === undefined) return {}
  if (!isRecord(value)) throw new TypeError('Response headers must be an object')
  const headers: Record<string, string | readonly string[]> = {}
  for (const [name, field] of Object.entries(value)) {
    if (field === undefined) continue
    if (typeof field !== 'string' && !(Array.isArray(field) && field.every((item) => typeof item === 'string'))) {
      throw new TypeError(`Response header "${name}" must be text or an array of text`)
    }
    const key = name.toLowerCase()
    const previous = Object.hasOwn(headers, key) ? headers[key] : undefined
    setOwn(
      headers,
      key,
      previous === undefined
        ? field
        : [...(typeof previous === 'string' ? [previous] : previous), ...(typeof field === 'string' ? [field] : field)]
    )
  }
  return headers
}

export function responseHeader(headers: ResponseHeaderValues, name: string): string | undefined {
  const value = headers[name]
  return typeof value === 'string' || value === undefined ? value : value.join(', ')
}
