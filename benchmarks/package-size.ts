import { execFileSync } from 'node:child_process'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'

type PackageSizeTarget = {
  readonly comparison: 'breakdown' | 'executable'
  readonly entry: string
  readonly imports: string
  readonly runtime: string
}

type PackageSizeResult = {
  readonly comparison: 'breakdown' | 'executable'
  readonly gzipBytes: number
  readonly imports: string
  readonly minifiedBytes: number
  readonly runtime: string
}

const budgets = {
  '@hulla/api': { gzipBytes: 16_000, minifiedBytes: 48_000 },
  'Transport-neutral client + server': { gzipBytes: 10_500, minifiedBytes: 33_000 },
  'Fetch client transport': { gzipBytes: 1_400, minifiedBytes: 3_000 },
} as const

const targets: readonly PackageSizeTarget[] = [
  {
    runtime: '@hulla/api',
    entry: 'hulla-api',
    imports: '@hulla/api + /client + /server + /fetch',
    comparison: 'executable',
  },
  {
    runtime: 'Contract declarations',
    entry: 'hulla-api-contract',
    imports: '@hulla/api',
    comparison: 'breakdown',
  },
  {
    runtime: 'Transport-neutral client',
    entry: 'hulla-api-client',
    imports: '@hulla/api + /client',
    comparison: 'breakdown',
  },
  {
    runtime: 'Transport-neutral server',
    entry: 'hulla-api-server',
    imports: '@hulla/api + /server',
    comparison: 'breakdown',
  },
  {
    runtime: 'Transport-neutral client + server',
    entry: 'hulla-api-core',
    imports: '@hulla/api + /client + /server',
    comparison: 'breakdown',
  },
  {
    runtime: 'Fetch client transport',
    entry: 'hulla-api-fetch-client',
    imports: '@hulla/api/fetch (fetchTransport)',
    comparison: 'breakdown',
  },
  {
    runtime: 'Fetch server adapter',
    entry: 'hulla-api-fetch-adapter',
    imports: '@hulla/api/fetch (createFetchHandler)',
    comparison: 'breakdown',
  },
  {
    runtime: 'Core adapter dispatcher',
    entry: 'hulla-api-wire-adapter',
    imports: '@hulla/api/adapters (createAdapterHandler)',
    comparison: 'breakdown',
  },
  {
    runtime: 'Express server adapter',
    entry: 'hulla-api-express-adapter',
    imports: '@hulla/api-express (register)',
    comparison: 'breakdown',
  },
  {
    runtime: 'Cloudflare Workers adapter',
    entry: 'hulla-api-cloudflare-adapter',
    imports: '@hulla/api-cloudflare (createWorkerHandler)',
    comparison: 'breakdown',
  },
  {
    runtime: 'Next.js server adapter',
    entry: 'hulla-api-next-adapter',
    imports: '@hulla/api-next/server (createRouteHandler)',
    comparison: 'breakdown',
  },
  {
    runtime: 'TanStack Start server adapter',
    entry: 'hulla-api-tanstack-start-adapter',
    imports: '@hulla/api-tanstack-start/server (createServerRouteHandlers)',
    comparison: 'breakdown',
  },
  {
    runtime: 'tRPC',
    entry: 'trpc',
    imports: '@trpc/client + @trpc/server',
    comparison: 'executable',
  },
  {
    runtime: 'oRPC',
    entry: 'orpc',
    imports: '@orpc/client + @orpc/server',
    comparison: 'executable',
  },
  {
    runtime: 'ts-rest',
    entry: 'ts-rest',
    imports: '@ts-rest/core + @ts-rest/serverless/fetch',
    comparison: 'executable',
  },
  { runtime: 'Hono RPC', entry: 'hono', imports: 'hono + hono/client', comparison: 'executable' },
]

const outputDirectory = new URL('./.size-output/', import.meta.url)
const resultsDirectory = new URL('./results/', import.meta.url)
const resultPath = new URL('./results/package-size.json', import.meta.url)
const analysisJsonPath = new URL('./results/bundle-analysis.json', import.meta.url)
const analysisMarkdownPath = new URL('./results/bundle-analysis.md', import.meta.url)
const sourceAnalysisJsonPath = new URL('./results/bundle-source-analysis.json', import.meta.url)
const sourceAnalysisMarkdownPath = new URL('./results/bundle-source-analysis.md', import.meta.url)
const analyze = process.argv.includes('--analyze')
const check = process.argv.includes('--check')
await rm(outputDirectory, { recursive: true, force: true })
await mkdir(outputDirectory, { recursive: true })
await mkdir(resultsDirectory, { recursive: true })

const results: PackageSizeResult[] = []
try {
  for (const target of targets) {
    const output = new URL(`${target.entry}.js`, outputDirectory)
    const analysisArguments =
      analyze && target.entry === 'hulla-api'
        ? [`--metafile=${analysisJsonPath.pathname}`, `--metafile-md=${analysisMarkdownPath.pathname}`]
        : []
    execFileSync(
      'bun',
      [
        'build',
        `size/${target.entry}.ts`,
        '--target=bun',
        '--minify',
        '--external=zod',
        `--outfile=${output.pathname}`,
        ...analysisArguments,
      ],
      { cwd: new URL('.', import.meta.url), stdio: 'ignore' }
    )
    const contents = await readFile(output)
    results.push({
      comparison: target.comparison,
      imports: target.imports,
      runtime: target.runtime,
      minifiedBytes: contents.byteLength,
      gzipBytes: gzipSync(contents.toString('utf8'), { level: 9 }).byteLength,
    })
  }

  if (analyze) {
    const sourceEntry = new URL('./hulla-api-source.ts', outputDirectory)
    const sourceOutput = new URL('./hulla-api-source.js', outputDirectory)
    const publicEntry = await readFile(new URL('./size/hulla-api.ts', import.meta.url), 'utf8')
    const sourceImports = publicEntry
      .replace("from '@hulla/api/client'", "from '../../packages/core/src/client/index'")
      .replace("from '@hulla/api/server'", "from '../../packages/core/src/server/index'")
      .replace("from '@hulla/api/fetch'", "from '../../packages/core/src/fetch/index'")
      .replace("from '@hulla/api'", "from '../../packages/core/src/index'")
    await writeFile(sourceEntry, sourceImports, 'utf8')
    execFileSync(
      'bun',
      [
        'build',
        sourceEntry.pathname,
        '--target=bun',
        '--minify',
        '--external=zod',
        `--outfile=${sourceOutput.pathname}`,
        `--metafile=${sourceAnalysisJsonPath.pathname}`,
        `--metafile-md=${sourceAnalysisMarkdownPath.pathname}`,
      ],
      { cwd: new URL('.', import.meta.url), stdio: 'ignore' }
    )
  }

  await writeFile(resultPath, `${JSON.stringify(results, undefined, 2)}\n`, 'utf8')
  if (check) {
    for (const [runtime, budget] of Object.entries(budgets)) {
      const result = results.find((candidate) => candidate.runtime === runtime)!
      const exceeded = (['minifiedBytes', 'gzipBytes'] as const).filter((metric) => result[metric] > budget[metric])
      if (exceeded.length > 0) {
        throw new Error(
          `${runtime} exceeds its bundle budget: ${exceeded
            .map((metric) => `${metric} ${result[metric]} > ${budget[metric]}`)
            .join(', ')}`
        )
      }
    }
  }
} finally {
  await rm(outputDirectory, { recursive: true, force: true })
}
