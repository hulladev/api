import { nuxtAdapter } from '@hulla/api-nuxt/server'
import { defineEventHandler } from 'h3'
import { implementation } from '../api-implementation'

export default defineEventHandler(nuxtAdapter().mount(implementation))
