import { route, type RouteConfig } from '@react-router/dev/routes'

export default [route('api/*', './routes/api.ts')] satisfies RouteConfig
