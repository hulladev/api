import { createFileRoute } from '@tanstack/react-router'
import { getHealth } from '../api/health.functions'

export const Route = createFileRoute('/')({
  loader: () => getHealth(),
  component: Page,
})

function Page() {
  const health = Route.useLoaderData()
  return <main>@hulla/api TanStack Start fixture: {health}</main>
}
