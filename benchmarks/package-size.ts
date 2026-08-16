import { execFileSync } from 'node:child_process'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'

type PackageSizeTarget = {
  readonly entry: string
  readonly runtime: string
}

type PackageSizeResult = {
  readonly gzipBytes: number
  readonly minifiedBytes: number
  readonly runtime: string
}

const targets: readonly PackageSizeTarget[] = [
  { runtime: '@hulla/api', entry: 'hulla-api' },
  { runtime: 'tRPC', entry: 'trpc' },
  { runtime: 'oRPC', entry: 'orpc' },
  { runtime: 'ts-rest', entry: 'ts-rest' },
  { runtime: 'Hono RPC', entry: 'hono' },
]

const outputDirectory = new URL('./.size-output/', import.meta.url)
const resultPath = new URL('./results/package-size.json', import.meta.url)
await rm(outputDirectory, { recursive: true, force: true })
await mkdir(outputDirectory, { recursive: true })

const results: PackageSizeResult[] = []
try {
  for (const target of targets) {
    const output = new URL(`${target.entry}.js`, outputDirectory)
    execFileSync(
      'bun',
      [
        'build',
        `size/${target.entry}.ts`,
        '--target=bun',
        '--minify',
        '--external=zod',
        `--outfile=${output.pathname}`,
      ],
      { cwd: new URL('.', import.meta.url), stdio: 'ignore' }
    )
    const contents = await readFile(output)
    results.push({
      runtime: target.runtime,
      minifiedBytes: contents.byteLength,
      gzipBytes: gzipSync(contents.toString('utf8'), { level: 9 }).byteLength,
    })
  }

  await mkdir(new URL('./results/', import.meta.url), { recursive: true })
  await writeFile(resultPath, `${JSON.stringify(results, undefined, 2)}\n`, 'utf8')
} finally {
  await rm(outputDirectory, { recursive: true, force: true })
}
