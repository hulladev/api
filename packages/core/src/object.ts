export function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isPlainRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  if (!isRecord(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

export function hasOwn(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key)
}

export function setOwn(target: Record<string, unknown>, key: string, value: unknown): void {
  Object.defineProperty(target, key, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  })
}

export function copyRecord(source: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const target: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(source)) setOwn(target, key, value)
  return target
}

export function freezeRecordTree(
  value: Record<string, unknown>,
  freezeFunctions = true
): Readonly<Record<string, unknown>> {
  for (const [key, nested] of Object.entries(value)) {
    if (isRecord(nested)) setOwn(value, key, freezeRecordTree(nested as Record<string, unknown>, freezeFunctions))
    else if (freezeFunctions && typeof nested === 'function') Object.freeze(nested)
  }
  return Object.freeze(value)
}
