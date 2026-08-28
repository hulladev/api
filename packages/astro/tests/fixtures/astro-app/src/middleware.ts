import { defineMiddleware } from 'astro:middleware'

export const onRequest = defineMiddleware(({ locals }, next) => {
  locals.actor = 'Ada'
  return next()
})
