import { generate } from '@hulla/api'
import { fromDrizzle } from '@hulla/api-drizzle/config'
import { tanstackDbPlugin } from '@hulla/api-tanstack-db'
import { tanstackQueryPlugin } from '@hulla/api-tanstack-query'
import { zodWireSchemaConverter } from '@hulla/api/zod'

export default generate({
  schemaConverters: [zodWireSchemaConverter()],
  sources: [
    fromDrizzle({
      name: 'database',
      config: './drizzle.config.ts',
      expose: './apps/backend/src/db/schema.ts',
      basePath: '/api',
      routes: 'all',
      plugins: [tanstackQueryPlugin(), tanstackDbPlugin()],
    }),
  ],
  output: {
    dir: './packages/api-client/src/generated',
    entry: './packages/api-client/src/index.ts',
  },
})
