import { generate } from '@hulla/api'
import { zodWireSchemaConverter } from '@hulla/api/zod'

export default generate({
  routers: {
    dir: './apps/backend/src/api',
  },
  schemaConverters: [zodWireSchemaConverter()],
  output: {
    dir: './apps/web/src/api/generated',
  },
})
