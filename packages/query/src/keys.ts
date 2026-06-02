export function encodeKey<const RN extends string, const N extends string>(router: RN, name: N) {
  return `${router}/${name}` as const
}

export function queryKey<const RN extends string, const N extends string, const A extends readonly unknown[]>(
  router: RN,
  name: N,
  ...args: A
) {
  return [encodeKey(router, name), ...args] as const
}
