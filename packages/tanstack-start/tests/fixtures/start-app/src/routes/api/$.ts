import { createServerRouteHandlers } from '@hulla/api-tanstack-start/server'
import { createFileRoute } from '@tanstack/react-router'
import { implementation } from '../../api/server'

export const Route = createFileRoute('/api/$')({
  server: {
    handlers: createServerRouteHandlers(implementation),
  },
})
