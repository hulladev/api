import { QueryClientProvider } from '@tanstack/react-query'
import { HeadContent, Outlet, Scripts, createRootRoute } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { queryClient } from '../data'
import styles from '../styles.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Form / Function — Training log' },
      {
        name: 'description',
        content: 'A Hulla API, Drizzle, Hono, and TanStack Start integration test.',
      },
    ],
    links: [{ rel: 'stylesheet', href: styles }],
  }),
  component: RootComponent,
})

function RootComponent() {
  return (
    <RootDocument>
      <QueryClientProvider client={queryClient}>
        <Outlet />
      </QueryClientProvider>
    </RootDocument>
  )
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
