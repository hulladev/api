import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({ component: Page })

function Page() {
  return <main>Hulla TanStack Start fixture</main>
}
