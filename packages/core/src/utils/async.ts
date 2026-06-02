export function isPromiseLike<T>(value: T | Promise<T>): value is Promise<T> {
  return typeof (value as Promise<T>)?.then === 'function'
}

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor

export function isAsyncFunction(fn: unknown): fn is (...args: any[]) => Promise<any> {
  return typeof fn === 'function' && fn instanceof AsyncFunction
}
