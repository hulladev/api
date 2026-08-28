import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({ component: Page })

function Page() {
  return <main>@hulla/api TanStack Start fixture</main>
}
