import { z } from 'zod'
import { api } from '../../src/api'
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

const h = api({
  plugins: [createQueryPlugin()],
})

const standaloneProcedure = h.procedure.input(z.string()).handler(({ input }) => input)

const routeProcedure = h.router('users').define(({ procedure }) => ({
  byId: procedure.input(z.string()).handler(({ input }) => input),
})).byId

export const call = standaloneProcedure.call
export const callProcedure = routeProcedure.callProcedure
export const queryOptions = routeProcedure.query.options
