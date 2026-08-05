import { z } from 'zod'
import { createApi } from '../../src/api'
import { clientSchema } from '../../src/client'
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

function createQueryPlugin(): APIPlugin<'fixture', undefined, undefined, QueryProcedureTypeHook> {
  return {
    id: 'fixture',
    procedureTypes: undefined as unknown as QueryProcedureTypeHook,
  }
}

const api = createApi({
  plugins: [createQueryPlugin()],
})

const standaloneProcedure = api.procedure.input(z.string()).handler(({ input }) => input)
const singleArrayProcedure = api.procedure.input(z.array(z.string())).handler(({ input }) => input)
const multipleProcedure = api.procedure.input(z.string(), z.number()).handler(({ input }) => input)
const trailingOptionalProcedure = api.procedure.input(z.string(), z.number().optional()).handler(({ input }) => input)
const optionalFirstProcedure = api.procedure.input(z.string().optional(), z.number()).handler(({ input }) => input)
const idSchema = z.string()
const patchSchema = z.number()
const optionalQuerySchema = z.string().optional()
const limitSchema = z.number()
const optionalLimitSchema = z.number().optional()
const namedMultipleProcedure = api.procedure.input
  .$named<[id: typeof idSchema, patch: typeof patchSchema]>(idSchema, patchSchema)
  .handler(({ input }) => input)
const namedTrailingOptionalProcedure = api.procedure.input
  .$named<[query: typeof idSchema, limit?: typeof optionalLimitSchema]>(idSchema, optionalLimitSchema)
  .handler(({ input }) => input)
const namedOptionalFirstProcedure = api.procedure.input
  .$named<[query: typeof optionalQuerySchema, limit: typeof limitSchema]>(optionalQuerySchema, limitSchema)
  .handler(({ input }) => input)
namedMultipleProcedure('user_123', 2)
namedTrailingOptionalProcedure('hulla')
namedOptionalFirstProcedure(undefined, 10)
// @ts-expect-error optional-first named inputs retain the required second position
namedOptionalFirstProcedure(10)
const generatedClientSingle = api.procedure.input(clientSchema<string[]>()).handler(({ input }) => input)
const generatedClientMultiple = api.procedure
  .input(clientSchema<string>(), clientSchema<number>())
  .handler(({ input }) => input)
const generatedClientTrailingOptional = api.procedure
  .input(clientSchema<string>(), clientSchema<number | undefined>())
  .handler(({ input }) => input)
const generatedClientOptionalFirst = api.procedure
  .input(clientSchema<string | undefined>(), clientSchema<number>())
  .handler(({ input }) => input)

generatedClientSingle(['hulla', 'api'])
generatedClientMultiple('hulla', 2)
generatedClientTrailingOptional('hulla')
generatedClientTrailingOptional('hulla', 2)
generatedClientOptionalFirst(undefined, 2)
// @ts-expect-error multiple client inputs require every non-optional argument
generatedClientMultiple('hulla')
// @ts-expect-error an optional input before a required input keeps its positional slot
generatedClientOptionalFirst(2)
// @ts-expect-error client procedures reject extra positional arguments
generatedClientMultiple('hulla', 2, true)

const routes = api.router('users').define(({ procedure }) => ({
  byId: procedure.input(z.string()).handler(({ input }) => input),
  compare: procedure.input(z.string(), z.number()).handler(({ input }) => input),
  search: procedure.input(z.string(), z.number().optional()).handler(({ input }) => input),
  optionalFirst: procedure.input(z.string().optional(), z.number()).handler(({ input }) => input),
}))

function invoke<Args extends unknown[], Result>(procedure: (...args: Args) => Result) {
  return (...args: Args) => procedure(...args)
}

export const call = invoke(standaloneProcedure)
export const callSingleArray = invoke(singleArrayProcedure)
export const callMultiple = invoke(multipleProcedure)
export const callTrailingOptional = invoke(trailingOptionalProcedure)
export const callOptionalFirst = invoke(optionalFirstProcedure)
export const callNamedMultiple = invoke(namedMultipleProcedure)
export const callNamedTrailingOptional = invoke(namedTrailingOptionalProcedure)
export const callNamedOptionalFirst = invoke(namedOptionalFirstProcedure)
export const generatedCallSingle = invoke(generatedClientSingle)
export const generatedCallMultiple = invoke(generatedClientMultiple)
export const generatedCallTrailingOptional = invoke(generatedClientTrailingOptional)
export const generatedCallOptionalFirst = invoke(generatedClientOptionalFirst)
export const callProcedure = routes.byId.$fixture.callProcedure
export const callProcedureMultiple = routes.compare.$fixture.callProcedure
export const callProcedureTrailingOptional = routes.search.$fixture.callProcedure
export const callProcedureOptionalFirst = routes.optionalFirst.$fixture.callProcedure
export const queryOptions = routes.byId.$fixture.query.options
