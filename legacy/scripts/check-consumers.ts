import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import ts from 'typescript'

const root = resolve(import.meta.dir, '..')
const runtimeEntries = [
  '@hulla/api',
  '@hulla/api/runtime',
  '@hulla/api/server',
  '@hulla/api/client',
  '@hulla/api/plugin',
  '@hulla/api/zod',
  '@hulla/api-drizzle',
  '@hulla/api-drizzle/config',
  '@hulla/api-express',
  '@hulla/api-openapi',
  '@hulla/api-swr',
  '@hulla/api-tanstack-db',
  '@hulla/api-tanstack-query',
] as const

const source = `
import { createApi, generate, type Schema } from '@hulla/api'
import { createHttpTransport, isHullaAPIError, type ClientRequestOptions } from '@hulla/api/client'
import { definePlugin, type APIProcedurePluginContext } from '@hulla/api/plugin'
import { createApiHandler } from '@hulla/api/server'
import { createExpressMiddleware } from '@hulla/api-express'
import { fromDrizzle } from '@hulla/api-drizzle/config'
import { generate as generateOpenAPI } from '@hulla/api-openapi'
import { swrPlugin } from '@hulla/api-swr'
import { tanstackDbPlugin } from '@hulla/api-tanstack-db'
import { tanstackQueryPlugin } from '@hulla/api-tanstack-query'

const stringSchema = {
  parse(input: unknown) { return String(input) },
  _input: undefined as unknown as string,
  _output: undefined as unknown as string,
} satisfies Schema<string>

const plugin = definePlugin({
  id: 'consumer',
  procedure(context: APIProcedurePluginContext) {
    return { route: context.meta.route }
  },
})
const api = createApi({ plugins: [plugin, swrPlugin(), tanstackQueryPlugin(), tanstackDbPlugin()] })
const routes = api.router('users').define(({ route }) => ({
  byId: route('GET', '/:id').input(stringSchema).handler(({ input }) => input),
}))
const handler = createApiHandler({ routers: [routes] })
const middleware = createExpressMiddleware(handler)
const transport = createHttpTransport({ baseUrl: '/api' })
const requestOptions: ClientRequestOptions = { signal: new AbortController().signal }

generate({ sources: [], output: { dir: './generated' } })
fromDrizzle({ routes: 'all' })
void generateOpenAPI
void middleware
void transport
void requestOptions
void isHullaAPIError
`

const workspace = await mkdtemp(join(tmpdir(), 'hulla-package-consumer-'))
try {
  await linkWorkspacePackages(workspace)
  const commonJS = join(workspace, 'runtime.cjs')
  const esm = join(workspace, 'runtime.mjs')
  await writeFile(commonJS, runtimeScript('require'))
  await writeFile(esm, runtimeScript('import'))
  await checkRuntime('CommonJS', commonJS)
  await checkRuntime('ES modules', esm)
  checkCLI()
  await checkTypes(workspace)
  console.log('Built-package consumers passed (CJS, ESM, NodeNext, Node16, and bundler resolution).')
} finally {
  await rm(workspace, { recursive: true, force: true })
}

function runtimeScript(mode: 'require' | 'import'): string {
  const entries = JSON.stringify(runtimeEntries)
  return mode === 'require'
    ? `for (const entry of ${entries}) require(entry)`
    : `await Promise.all(${entries}.map((entry) => import(entry)))`
}

async function checkRuntime(label: string, file: string): Promise<void> {
  const result = spawnSync('node', [file], { cwd: root, encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`${label} package loading failed:\n${result.stderr || result.stdout}`)
}

function checkCLI(): void {
  const result = spawnSync('node', [join(root, 'packages/core/dist/cli.js'), '--help'], {
    cwd: root,
    encoding: 'utf8',
  })
  if (result.status !== 0 || !result.stdout.includes('Usage: hulla api')) {
    throw new Error(`Built CLI check failed:\n${result.stderr || result.stdout}`)
  }
}

async function checkTypes(directory: string): Promise<void> {
  const variants = [
    {
      file: 'consumer.mts',
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
    },
    {
      file: 'consumer.cts',
      module: ts.ModuleKind.Node16,
      moduleResolution: ts.ModuleResolutionKind.Node16,
    },
    {
      file: 'consumer.ts',
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
    },
  ] as const

  for (const variant of variants) {
    const file = join(directory, variant.file)
    await writeFile(file, source)
    const program = ts.createProgram([file], {
      target: ts.ScriptTarget.ES2022,
      module: variant.module,
      moduleResolution: variant.moduleResolution,
      lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'],
      strict: true,
      noEmit: true,
      skipLibCheck: true,
      types: [],
    })
    const diagnostics = ts.getPreEmitDiagnostics(program)
    if (diagnostics.length > 0) {
      throw new Error(
        `TypeScript ${variant.file} consumer failed:\n${ts.formatDiagnosticsWithColorAndContext(diagnostics, {
          getCanonicalFileName: (name) => name,
          getCurrentDirectory: () => directory,
          getNewLine: () => '\n',
        })}`
      )
    }
  }
}

async function linkWorkspacePackages(directory: string): Promise<void> {
  const scope = join(directory, 'node_modules/@hulla')
  await mkdir(scope, { recursive: true })
  for (const [name, packageDirectory] of [
    ['api', 'core'],
    ['api-drizzle', 'drizzle'],
    ['api-express', 'express'],
    ['api-openapi', 'openapi'],
    ['api-swr', 'swr'],
    ['api-tanstack-db', 'tanstack-db'],
    ['api-tanstack-query', 'tanstack-query'],
  ] as const) {
    await symlink(join(root, 'packages', packageDirectory), join(scope, name), 'dir')
  }
}
