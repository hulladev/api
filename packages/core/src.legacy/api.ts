import { procedure } from './procedure'
import { router } from './router'
import type { Fn, Group, Obj, OutputFn, Schema, SDK, SDKConfig } from './types'

export function api<
  const G extends {
    [K in string]: Group<CTX, PK, DM, K>
  },
  const DI extends Schema<any, any, PK> | Fn<any, any>,
  const DO extends Schema<any, any, PK> | OutputFn<any>,
  const AM extends string[],
  const CTX extends Obj = Record<string, never>,
  const PK extends string = 'parse',
  const DM extends AM[number] = 'call',
>(config?: SDKConfig<CTX, PK, DM, G, DI, DO, AM>): SDK<CTX, PK, DM, G, DI, DO, AM[number]> {
  const context: CTX = config?.context ?? ({} as CTX)
  const parseKey: PK = config?.parseKey ?? ('parse' as PK)
  const defaultMethod: DM = config?.defaults?.method ?? ('call' as DM)

  // @ts-expect-error the resulting type cannot know which key it will index from generic at build time
  const sdkBase: SDK<CTX, PK, DM, G> = {
    router: router<CTX, PK>({ context, parseKey }),
    procedure: procedure<CTX, CTX, PK, DM, 'procedure', DI, DO, AM[number]>({
      context,
      parseKey,
      group: 'procedure',
      defaultMethod,
      defaultContext: context,
      defaultInput: config?.defaults?.input,
      defaultOutput: config?.defaults?.output,
    }),
  }

  for (const [groupName, groupConfig] of Object.entries(config?.groups ?? {})) {
    sdkBase[groupName as keyof G] = procedure({
      // @ts-expect-error the resulting type cannot know which key it will index from generic at build time
      context: groupConfig?.context ?? context,
      parseKey,
      defaultMethod: groupConfig?.defaults?.method ?? defaultMethod,
      group: groupName,
      defaultInput: groupConfig?.defaults?.input ?? config?.defaults?.input,
      defaultOutput: groupConfig?.defaults?.output ?? config?.defaults?.output,
      defaultContext: context,
    })
  }

  return sdkBase
}
