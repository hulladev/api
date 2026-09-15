import { defineMiddleware } from 'astro:middleware'

export const onRequest = defineMiddleware(({ locals, cookies }, next) => {
  // Fixture session lookup; real applications verify the session here.
  locals.actor = cookies.get('session')?.value === 'grace' ? 'Grace' : 'Ada'
  return next()
})
