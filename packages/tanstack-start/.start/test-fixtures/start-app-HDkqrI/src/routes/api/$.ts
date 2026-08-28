import { tanStackStartAdapter } from '@hulla/api-tanstack-start'
import { createFileRoute } from '@tanstack/react-router'
import { implementation } from '../../api/server'

export const Route = createFileRoute('/api/$')({
  server: {
    handlers: tanStackStartAdapter().mount(implementation),
  },
})
