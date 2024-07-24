import type { Group } from '@hulla/api'
import type { Methods } from '@hulla/fetch'

export const request = {
  allowedMethods: [
    'get',
    'post',
    'put',
    'patch',
    'delete',
    'head',
    'options',
    'connect',
    'trace',
  ] as const satisfies Lowercase<Methods>[],
  defaults: {
    method: 'get' as const satisfies Lowercase<Methods>,
  },
} satisfies Group<any, string, 'get', 'request'>
