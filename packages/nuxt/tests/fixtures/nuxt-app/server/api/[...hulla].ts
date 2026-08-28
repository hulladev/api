import { nuxtAdapter } from '@hulla/api-nuxt/server'
import { defineEventHandler } from 'h3'
import { implementation } from '../utils/api'

export default defineEventHandler(nuxtAdapter().mount(implementation))
