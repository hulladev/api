export type Args = readonly unknown[]
export type Methods = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS' | 'HEAD' | 'CONNECT' | 'TRACE'
export type Fn<A extends Args, R> = (...args: A) => R
export type FnShape = <A extends Args, R>(...args: A) => R

export type ArrayContains<T extends readonly unknown[], U> = U extends T[number] ? true : false
export type ArrayToTuple<T extends readonly unknown[]> = { [K in keyof T]: T[K] }
export type Obj = Record<string, unknown>
