import { reactRouterAdapter } from '@hulla/api-react-router'
import { implementation } from '../api/server'

const handlers = reactRouterAdapter().mount(implementation)

export const action = handlers.action
export const loader = handlers.loader
