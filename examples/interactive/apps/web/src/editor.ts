import * as monaco from 'monaco-editor/esm/vs/editor/editor.api.js'
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import 'monaco-editor/esm/vs/basic-languages/typescript/typescript.contribution.js'
import * as typeScriptContribution from 'monaco-editor/esm/vs/language/typescript/monaco.contribution.js'
import TypeScriptWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'
import openApiTypes from '../../../../../packages/openapi/dist/index.d.ts?raw'
import swrPluginTypes from '../../../../../packages/swr/dist/index.d.ts?raw'
import tanstackQueryTypes from '../../../../../packages/tanstack-query/dist/index.d.ts?raw'

const typeScript = typeScriptContribution as unknown as (typeof import('monaco-editor'))['typescript']

const coreTypeModules = import.meta.glob('../../../../../packages/core/dist/*.d.ts', {
  eager: true,
  import: 'default',
  query: '?raw',
}) as Record<string, string>

;(globalThis as typeof globalThis & { MonacoEnvironment?: unknown }).MonacoEnvironment = {
  getWorker(_: string, label: string) {
    if (label === 'typescript' || label === 'javascript') return new TypeScriptWorker()
    return new EditorWorker()
  },
}

let configured = false

export function configureMonaco() {
  if (configured) return monaco
  configured = true

  monaco.editor.defineTheme('hulla-signal', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '77776F', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'FF7048' },
      { token: 'string', foreground: 'D7FF42' },
      { token: 'number', foreground: 'F2C879' },
      { token: 'type.identifier', foreground: '9DDBFF' },
      { token: 'identifier', foreground: 'F3EFE4' },
    ],
    colors: {
      'editor.background': '#20221D',
      'editor.foreground': '#F3EFE4',
      'editor.lineHighlightBackground': '#292B25',
      'editor.selectionBackground': '#FF542655',
      'editor.inactiveSelectionBackground': '#FF54262B',
      'editorCursor.foreground': '#D7FF42',
      'editorLineNumber.foreground': '#686A60',
      'editorLineNumber.activeForeground': '#F3EFE4',
      'editorHoverWidget.background': '#11120F',
      'editorHoverWidget.border': '#FF5426',
      'editorSuggestWidget.background': '#11120F',
      'editorSuggestWidget.border': '#62645B',
      'editorSuggestWidget.selectedBackground': '#35372F',
      'editorError.foreground': '#FF5426',
      'editorWarning.foreground': '#F2C879',
    },
  })

  typeScript.typescriptDefaults.setCompilerOptions({
    allowNonTsExtensions: true,
    lib: ['es2022', 'dom', 'dom.iterable'],
    module: typeScript.ModuleKind.ESNext,
    moduleResolution: typeScript.ModuleResolutionKind.NodeJs,
    noEmit: true,
    strict: true,
    target: typeScript.ScriptTarget.ES2020,
  })
  typeScript.typescriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
  })

  for (const [path, source] of Object.entries(coreTypeModules)) {
    const filename = path.slice(path.lastIndexOf('/') + 1)
    typeScript.typescriptDefaults.addExtraLib(source, `file:///node_modules/@hulla/api/${filename}`)
  }

  typeScript.typescriptDefaults.addExtraLib(
    tanstackQueryTypes,
    'file:///node_modules/@hulla/api-tanstack-query/index.d.ts'
  )
  typeScript.typescriptDefaults.addExtraLib(swrPluginTypes, 'file:///node_modules/@hulla/api-swr/index.d.ts')
  typeScript.typescriptDefaults.addExtraLib(openApiTypes, 'file:///node_modules/@hulla/api-openapi/index.d.ts')
  typeScript.typescriptDefaults.addExtraLib(zodTypes, 'file:///node_modules/zod/index.d.ts')
  typeScript.typescriptDefaults.addExtraLib(reactQueryTypes, 'file:///node_modules/@tanstack/react-query/index.d.ts')
  typeScript.typescriptDefaults.addExtraLib(swrTypes, 'file:///node_modules/swr/index.d.ts')
  typeScript.typescriptDefaults.addExtraLib(reactDbTypes, 'file:///node_modules/@tanstack/react-db/index.d.ts')
  typeScript.typescriptDefaults.addExtraLib(tanstackDbTypes, 'file:///node_modules/@hulla/api-tanstack-db/index.d.ts')

  return monaco
}

const zodTypes = `
export interface ZodType<Input = unknown, Output = Input> {
  readonly _input: Input
  readonly _output: Output
  parse(input: unknown): Output
  parseAsync(input: unknown): Promise<Output>
  optional(): ZodType<Input | undefined, Output | undefined>
  array(): ZodType<Input[], Output[]>
  nullable(): ZodType<Input | null, Output | null>
}

export interface ZodString extends ZodType<string> {
  trim(): ZodString
  min(length: number): ZodString
  max(length: number): ZodString
}

export interface ZodNumber extends ZodType<number> {}
export interface ZodBoolean extends ZodType<boolean> {}

type InputOf<Schema> = Schema extends ZodType<infer Input, unknown> ? Input : never
type OutputOf<Schema> = Schema extends ZodType<unknown, infer Output> ? Output : never
type Shape = Record<string, ZodType<unknown, unknown>>
type ObjectInput<S extends Shape> = {
  [Key in keyof S as undefined extends InputOf<S[Key]> ? never : Key]: InputOf<S[Key]>
} & {
  [Key in keyof S as undefined extends InputOf<S[Key]> ? Key : never]?: Exclude<InputOf<S[Key]>, undefined>
}
type ObjectOutput<S extends Shape> = {
  [Key in keyof S as undefined extends OutputOf<S[Key]> ? never : Key]: OutputOf<S[Key]>
} & {
  [Key in keyof S as undefined extends OutputOf<S[Key]> ? Key : never]?: Exclude<OutputOf<S[Key]>, undefined>
}

export interface ZodObject<S extends Shape> extends ZodType<ObjectInput<S>, ObjectOutput<S>> {}

export interface ZodEnum<Values extends readonly [string, ...string[]]>
  extends ZodType<Values[number]> {}

export const z: {
  string(): ZodString
  number(): ZodNumber
  boolean(): ZodBoolean
  object<const S extends Shape>(shape: S): ZodObject<S>
  array<S extends ZodType<unknown, unknown>>(schema: S): ZodType<InputOf<S>[], OutputOf<S>[]>
  enum<const Values extends readonly [string, ...string[]]>(values: Values): ZodEnum<Values>
}

export namespace z {
  export type infer<Schema extends ZodType<unknown, unknown>> = OutputOf<Schema>
  export type input<Schema extends ZodType<unknown, unknown>> = InputOf<Schema>
  export type output<Schema extends ZodType<unknown, unknown>> = OutputOf<Schema>
}
`

const reactQueryTypes = `
export type QueryOptions<T> = { queryKey: readonly unknown[]; queryFn: () => T | Promise<T> }
export type MutationOptions<Input, Output> = {
  mutationKey: readonly unknown[]
  mutationFn: (input: Input) => Output | Promise<Output>
}
type QueryData<Options> = Options extends { queryFn: (...args: never[]) => infer Result }
  ? Awaited<Result>
  : unknown
export declare function useQuery<Options>(options: Options): {
  data: QueryData<Options> | undefined
  isLoading: boolean
  isPending: boolean
  isFetching: boolean
  refetch(): Promise<{ data: QueryData<Options> | undefined }>
}
export declare function useMutation<Input, Output>(
  options: MutationOptions<Input, Output> & { onSuccess?: (value: Awaited<Output>) => unknown }
): { mutate(input: Input): void }
export declare class QueryClient {
  invalidateQueries(options: { queryKey: readonly unknown[] }): Promise<void>
}
export declare function useQueryClient(): QueryClient
`

const swrTypes = `
type DataOf<Fetcher> = Fetcher extends (...args: never[]) => infer Result ? Awaited<Result> : unknown
export default function useSWR<Key, Fetcher extends (...args: never[]) => unknown>(
  key: Key,
  fetcher: Fetcher
): { data: DataOf<Fetcher> | undefined; isLoading: boolean; error: unknown }
`

const reactDbTypes = `
type ItemOf<Options> = Options extends { readonly item: infer Item } ? Item : never
type Mutable<Item> = {
  -readonly [Key in keyof Item]: Item[Key] extends object ? Mutable<Item[Key]> : Item[Key]
}
export declare function createCollection<Options>(options: Options): {
  update(id: string, callback: (draft: Mutable<ItemOf<Options>>) => void): {
    isPersisted: { promise: Promise<void> }
  }
}
`

const tanstackDbTypes = `
type Procedure = ((...args: never[]) => unknown) & { $key: { root: string } }
type ItemFor<Routes extends { list: Procedure }> =
  Awaited<ReturnType<Routes['list']>> extends readonly (infer Item extends object)[] ? Item : never
type ItemKey<Item extends object> = {
  [Key in keyof Item]-?: Item[Key] extends string | number ? Key : never
}[keyof Item]

export declare function crudCollectionOptions<
  Routes extends { list: Procedure; create: Procedure; update: Procedure; delete: Procedure },
  Key extends ItemKey<ItemFor<Routes>>
>(options: {
  routes: Routes
  key: Key
  queryClient: unknown
  mapInsert?: (mutation: { modified: ItemFor<Routes> }) => Parameters<Routes['create']>[0]
  refetch?: boolean
}): {
  readonly item: ItemFor<Routes>
  create(input: Parameters<Routes['create']>[0]): Promise<ItemFor<Routes>>
}
`
