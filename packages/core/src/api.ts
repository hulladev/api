import { procedure } from './procedure'
import { router } from './router'
import type { Group, Obj, SDK, SDKConfig } from './types'

export function api<
  const CTX extends Obj = Record<string, never>,
  const PK extends string = 'parse',
  const DM extends string = 'call',
  const G extends Record<string, unknown> = {},
>(config?: SDKConfig<CTX, PK, DM>): SDK<CTX, PK, DM, G> {
  const context: CTX = config?.context ?? ({} as CTX)
  const parseKey: PK = config?.parseKey ?? ('parse' as PK)
  const defaultMethod: DM = config?.defaultMethod ?? ('call' as DM)

  // Declare group function before its usage
  const group = <const GN extends string, const GC extends Group<CTX, PK, DM, GN>>(groupName: GN, groupConfig: GC) => {
    sdkBase[groupName] = // when override is passed, we ignore the rest and only use the override
      groupConfig?._override
        ? groupConfig._override({ context, meta: { group: groupName, route: groupName, method: defaultMethod } })
        : procedure({
            // @ts-expect-error the resulting type cannot know which key it will index from generic at build time
            context: groupConfig?.context ?? context,
            parseKey,
            defaultMethod: groupConfig?.defaultMethod ?? defaultMethod,
            group: groupName,
            defaultInput: groupConfig?.defaultInput,
            defaultOutput: groupConfig?.defaultOutput,
            defaultContext: context,
          })
    return sdkBase
  }

  // @ts-expect-error the resulting type cannot know which key it will index from generic at build time
  const sdkBase: SDK<CTX, PK, DM, G> = {
    router: router<CTX, PK>({ context, parseKey }),
    procedure: procedure<CTX, CTX, PK, DM, 'procedure', undefined, undefined>({
      context,
      parseKey,
      group: 'procedure',
      defaultMethod,
      defaultContext: context,
    }),
    group,
  }

  return sdkBase
}
