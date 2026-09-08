import { defineEventHandler, getCookie } from 'h3'

export default defineEventHandler((event) => {
  // Fixture session lookup; real applications verify the session here.
  event.context['actor'] = getCookie(event, 'session') === 'grace' ? 'Grace' : 'Ada'
})
