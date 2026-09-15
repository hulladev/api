import { apiCalls } from '../../probe'

export const dynamic = 'force-dynamic'
export function GET() {
  return Response.json({ calls: apiCalls() })
}
