import { procedure } from './procedure'
import { request } from './request'

export function route<const CTX>() {
  return <const N extends string>(route: N) => ({
    procedure: procedure<CTX, N>(route),
    request: request<CTX, N>(route),
  })
}
