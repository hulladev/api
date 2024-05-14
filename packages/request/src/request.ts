import { createRequest } from './createRequest'

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function request<const CTX>(_ctx?: CTX) {
  return {
    get: createRequest<'get', CTX>('get'),
    post: createRequest<'post', CTX>('post'),
    patch: createRequest<'patch', CTX>('patch'),
    put: createRequest<'put', CTX>('put'),
    delete: createRequest<'delete', CTX>('delete'),
    head: createRequest<'head', CTX>('head'),
    options: createRequest<'options', CTX>('options'),
    connect: createRequest<'connect', CTX>('connect'),
    trace: createRequest<'trace', CTX>('trace'),
  }
}
