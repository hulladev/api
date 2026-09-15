export const hullaRequestIdHeader = 'x-hulla-request-id'

export const hullaAPIErrorCodes = [
  'INPUT_CONFLICT',
  'INVALID_INPUT',
  'METHOD_NOT_ALLOWED',
  'NOT_FOUND',
  'UNSUPPORTED_MEDIA_TYPE',
  'UNKNOWN_ERROR',
] as const

export type HullaAPIErrorCode = (typeof hullaAPIErrorCodes)[number]

export type HullaAPIErrorBody<Code extends string = HullaAPIErrorCode> = {
  readonly code: Code
  readonly message: string
}

/** Encodes a standard JSON request or response body. */
export function encodeHTTPValue(value: unknown): string {
  const encoded = JSON.stringify(value, (_, item: unknown) => {
    if (typeof item === 'bigint') return item.toString()
    if (item instanceof Uint8Array) return bytesToBase64(item)
    return item
  })
  if (encoded === undefined) throw new TypeError('HTTP bodies must contain a JSON value.')
  return encoded
}

/** Decodes a standard JSON request or response body. */
export function decodeHTTPValue(value: string): unknown {
  return JSON.parse(value)
}

export function protocolHeaders(headers?: HeadersInit, requestId?: string | null): Headers {
  const result = new Headers(headers)
  if (requestId) result.set(hullaRequestIdHeader, requestId)
  else if (!result.has(hullaRequestIdHeader) && typeof globalThis.crypto?.randomUUID === 'function') {
    result.set(hullaRequestIdHeader, globalThis.crypto.randomUUID())
  }
  return result
}

export function bytesToBase64(value: Uint8Array): string {
  if (typeof Buffer !== 'undefined') return Buffer.from(value).toString('base64')
  let binary = ''
  for (const byte of value) binary += String.fromCharCode(byte)
  return btoa(binary)
}

export function base64ToBytes(value: string): Uint8Array {
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(value, 'base64'))
  const binary = atob(value)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}
