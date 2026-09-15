import { useLoaderData } from 'react-router'
import { api } from '../api/client.server'

export async function loader() {
  const result = await api.health()
  return { health: result.body }
}

export default function Home() {
  const { health } = useLoaderData<typeof loader>()
  return <main id="local-health">{health}</main>
}
