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
    imports: '@hulla/api/fetch (fetchAdapter)',
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
    imports: '@hulla/api-express (expressAdapter)',
    comparison: 'breakdown',
  },
  {
    runtime: 'Node HTTP server adapter',
    entry: 'hulla-api-node-http-adapter',
    imports: '@hulla/api-node-http (nodeHttpAdapter)',
    comparison: 'breakdown',
  },
  {
    runtime: 'Fastify server adapter',
    entry: 'hulla-api-fastify-adapter',
    imports: '@hulla/api-fastify (fastifyAdapter)',
    comparison: 'breakdown',
  },
  {
    runtime: 'Hono server adapter',
    entry: 'hulla-api-hono-adapter',
    imports: '@hulla/api-hono (honoAdapter)',
    comparison: 'breakdown',
  },
  {
    runtime: 'H3 server adapter',
    entry: 'hulla-api-h3-adapter',
    imports: '@hulla/api-h3 (h3Adapter)',
    comparison: 'breakdown',
  },
  {
    runtime: 'Cloudflare Workers adapter',
    entry: 'hulla-api-cloudflare-adapter',
    imports: '@hulla/api-cloudflare (cloudflareAdapter)',
    comparison: 'breakdown',
  },
  {
    runtime: 'Cloudflare Pages Functions adapter',
    entry: 'hulla-api-cloudflare-pages-adapter',
    imports: '@hulla/api-cloudflare/pages (cloudflarePagesAdapter)',
    comparison: 'breakdown',
  },
  {
    runtime: 'Google Cloud Run functions adapter',
    entry: 'hulla-api-google-cloud-functions-adapter',
    imports: '@hulla/api-google-cloud-functions (googleCloudFunctionsAdapter)',
    comparison: 'breakdown',
  },
  {
    runtime: 'Netlify Functions adapter',
    entry: 'hulla-api-netlify-functions-adapter',
    imports: '@hulla/api-netlify-functions (netlifyFunctionsAdapter)',
    comparison: 'breakdown',
  },
  {
    runtime: 'Next.js server adapter',
    entry: 'hulla-api-next-adapter',
    imports: '@hulla/api-next/server (nextAdapter)',
    comparison: 'breakdown',
  },
  {
    runtime: 'TanStack Start server adapter',
    entry: 'hulla-api-tanstack-start-adapter',
    imports: '@hulla/api-tanstack-start (tanStackStartAdapter)',
    comparison: 'breakdown',
  },
  {
    runtime: 'React Router v7 server adapter',
    entry: 'hulla-api-react-router-adapter',
    imports: '@hulla/api-react-router (reactRouterAdapter)',
    comparison: 'breakdown',
  },
  {
    runtime: 'SolidStart server adapter',
    entry: 'hulla-api-solid-start-adapter',
    imports: '@hulla/api-solid-start (solidStartAdapter)',
    comparison: 'breakdown',
  },
  {
    runtime: 'SvelteKit server adapter',
    entry: 'hulla-api-sveltekit-adapter',
    imports: '@hulla/api-sveltekit/server (svelteKitAdapter)',
    comparison: 'breakdown',
  },
  {
    runtime: 'SvelteKit remote transport',
    entry: 'hulla-api-sveltekit-remote',
    imports: '@hulla/api-sveltekit/remote (svelteKitRemoteTransport)',
    comparison: 'breakdown',
  },
  {
    runtime: 'Nuxt server adapter',
    entry: 'hulla-api-nuxt-adapter',
    imports: '@hulla/api-nuxt/server (nuxtAdapter)',
    comparison: 'breakdown',
  },
  {
    runtime: 'Nuxt request-aware client transport',
    entry: 'hulla-api-nuxt-client',
    imports: '@hulla/api-nuxt/client (nuxtFetchTransport)',
    comparison: 'breakdown',
  },
  {
    runtime: 'Astro server adapter',
    entry: 'hulla-api-astro-adapter',
    imports: '@hulla/api-astro (astroAdapter)',
    comparison: 'breakdown',
  },
  {
    runtime: 'Astro in-process transport',
    entry: 'hulla-api-astro-in-process',
    imports: '@hulla/api-astro (astroInProcessTransport)',
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
  {
    runtime: 'ts-rest stable core',
    entry: 'ts-rest-core',
    imports: '@ts-rest/core@3.52.1',
    comparison: 'breakdown',
  },
  {
    runtime: 'ts-rest Zod 4 RC core',
    entry: 'ts-rest-rc',
    imports: '@ts-rest/core@3.53.0-rc.1',
    comparison: 'breakdown',
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
        '--external=zod/*',
        '--external=$app/server',
        '--external=h3',
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
