import { option, parser, positional } from '@hulla/args'
import { z } from 'zod'

export const cli = parser({
  name: 'hulla-api-openapi',
  arguments: [
    positional({ name: 'input' }),
    option({ name: 'output', short: 'o' }),
    option({
      name: 'names',
      schema: z.enum(['operationId', 'path']),
    }),
  ],
})
