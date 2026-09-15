/** Tagged containers keep user keys/arrays distinct from binary and multipart encodings. */
type Wire = null | boolean | number | string | Wire[]

function base64(bytes: Uint8Array): string {
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 32_768) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768))
  }
  return btoa(binary)
}
function bytes(value: unknown): Uint8Array {
  if (typeof value !== 'string') throw new TypeError('Invalid WebSocket binary value')
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0))
}

export async function encodeWire(value: unknown): Promise<string> {
  const seen = new WeakSet<object>()
  async function encode(value: unknown): Promise<Wire> {
    if (value === undefined) return ['undefined']
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value !== 'object' || value === null)
      throw new TypeError('WebSocket values must be JSON-compatible, bytes or FormData')
    if (seen.has(value)) throw new TypeError('WebSocket values must not contain cycles')
    seen.add(value)
    try {
      if (value instanceof Uint8Array) return ['bytes', base64(value)]
      if (value instanceof FormData) {
        const entries: Wire[] = []
        for (const [name, field] of value) {
          entries.push([
            name,
            typeof field === 'string'
              ? field
              : ['file', base64(new Uint8Array(await field.arrayBuffer())), field.name, field.type, field.lastModified],
          ])
        }
        return ['form-data', entries]
      }
      if (Array.isArray(value)) {
        const entries: Wire[] = []
        for (const field of value) entries.push(await encode(field))
        return ['array', entries]
      }
      if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
        throw new TypeError('WebSocket objects must be plain records; encode native values with a contract codec')
      }
      const entries: Wire[] = []
      for (const [name, field] of Object.entries(value)) entries.push([name, await encode(field)])
      return ['object', entries]
    } finally {
      seen.delete(value)
    }
  }
  return JSON.stringify(await encode(value))
}

export function decodeWire(text: string): unknown {
  function decode(value: unknown): unknown {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (!Array.isArray(value)) throw new TypeError('Invalid WebSocket wire value')
    if (value.length === 1 && value[0] === 'undefined') return undefined
    if (value.length !== 2) throw new TypeError('Invalid WebSocket wire container')
    if (value[0] === 'bytes') return bytes(value[1])
    const entries: unknown = value[1]
    if (!Array.isArray(entries)) throw new TypeError('Invalid WebSocket wire entries')
    if (value[0] === 'array') return entries.map(decode)
    if (value[0] === 'object' || value[0] === 'form-data') {
      const record: Record<string, unknown> = {}
      const form = value[0] === 'form-data' ? new FormData() : undefined
      for (const entry of entries) {
        if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string')
          throw new TypeError('Invalid WebSocket wire entry')
        const [name, field] = entry as [string, unknown]
        if (form === undefined) {
          if (Object.hasOwn(record, name)) throw new TypeError('Duplicate WebSocket object key')
          Object.defineProperty(record, name, {
            value: decode(field),
            enumerable: true,
            writable: true,
            configurable: true,
          })
        } else if (typeof field === 'string') form.append(name, field)
        else {
          if (
            !Array.isArray(field) ||
            field.length !== 5 ||
            field[0] !== 'file' ||
            typeof field[2] !== 'string' ||
            typeof field[3] !== 'string' ||
            typeof field[4] !== 'number'
          )
            throw new TypeError('Invalid WebSocket multipart file')
          form.append(
            name,
            new File([bytes(field[1]) as BlobPart], field[2], { type: field[3], lastModified: field[4] })
          )
        }
      }
      return form ?? record
    }
    throw new TypeError('Unknown WebSocket wire container')
  }
  return decode(JSON.parse(text))
}
