import { z } from 'zod'
import { init } from '../../src/api'
import type {
  APIPlugin,
  APIProcedureArgs,
  APIProcedureKey,
  APIProcedureKeyRoot,
  APIProcedureResult,
} from '../../src/types.public'

type QueryProcedureTypeHook = {
  callProcedure: (...args: APIProcedureArgs) => APIProcedureResult
  query: {
    options: {
      (...args: APIProcedureArgs): {
        queryKey: APIProcedureKey
        queryFn: () => APIProcedureResult
      }
      (): {
        queryKey: readonly [APIProcedureKeyRoot]
        queryFn: (...args: APIProcedureArgs) => APIProcedureResult
      }
    }
  }
}

function createQueryPlugin(): APIPlugin<'query', undefined, undefined, QueryProcedureTypeHook> {
  return {
    id: 'query',
    procedureTypes: undefined as unknown as QueryProcedureTypeHook,
  }
}

const api = init({
  plugins: [createQueryPlugin()],
})

const standaloneProcedure = api.procedure.input(z.string()).handler(({ input }) => input)

const routeProcedure = api.router('users').define(({ procedure }) => ({
  byId: procedure.input(z.string()).handler(({ input }) => input),
})).byId

export const call = standaloneProcedure.call
export const callProcedure = routeProcedure.callProcedure
export const queryOptions = routeProcedure.query.options
