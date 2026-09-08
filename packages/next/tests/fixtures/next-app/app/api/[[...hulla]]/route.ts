import { recordApiCall } from '../../../probe'
import { adapter, implementation } from '../../../server'

const handler = adapter.mount(implementation)
export const GET: typeof handler = (request, context) => {
  recordApiCall()
  return handler(request, context)
}
