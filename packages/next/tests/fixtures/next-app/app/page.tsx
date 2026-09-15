import { api } from '../local-client'
import { Refresh } from './refresh'

export default async function Page() {
  const result = await api.health()
  return (
    <main>
      <span id="local-health">{result.body}</span>
      <Refresh />
    </main>
  )
}
