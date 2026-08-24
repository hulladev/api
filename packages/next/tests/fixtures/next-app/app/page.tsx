import { createNextCache } from '@hulla/api-next/client'
import { contract } from '../contract'

const cache = createNextCache(contract, {
  namespace: 'fixture',
  routes: {
    health: { cache: 'force-cache', next: { revalidate: 60 } },
  },
})

export default function Page() {
  return <main>{cache.tag(contract.routes.health)}</main>
}
