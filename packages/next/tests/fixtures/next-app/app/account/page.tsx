import { api } from '../../local-client'

// Declare request-time rendering outside the API error boundary.
export const dynamic = 'force-dynamic'

export default async function Account() {
  const result = await api.viewer()
  return <main id="viewer">{result.body}</main>
}
