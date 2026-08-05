import { createApi } from '@hulla/api'
import { tanstackDbPlugin } from '@hulla/api-tanstack-db'
import { tanstackQueryPlugin } from '@hulla/api-tanstack-query'

export const api = createApi({
  plugins: [
    tanstackQueryPlugin(),
    tanstackDbPlugin({
      collections: {
        tasks: 'id',
      },
    }),
  ],
})
