import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const exec = promisify(execFile)
const root = fileURLToPath(new URL('..', import.meta.url))
const fixtures = join(root, 'examples/runtime-hosts')
// The driver must be beneath the workspace so its fixture imports resolve the local built package.
const scratch = await mkdtemp(join(root, 'examples/.runtime-consumer-'))
async function command(binary: string, args: string[]) {
  try {
    const result = await exec(binary, args, {
      cwd: root,
      timeout: 120_000,
      maxBuffer: 2 * 1024 * 1024,
      env: { ...process.env, PORT: '0' },
    })
    process.stdout.write(result.stdout)
  } catch (error) {
    const failure = error as Error & { stdout?: string; stderr?: string }
    throw new Error(`${binary} ${args.join(' ')} failed\n${failure.stdout ?? ''}\n${failure.stderr ?? ''}`, {
      cause: error,
    })
  }
}
try {
  for (const runtime of ['bun', 'vercel', ...(process.argv.includes('--deno') ? ['deno'] : [])]) {
    const driver = join(scratch, `${runtime}.ts`)
    const entry = join(scratch, `${runtime}.mjs`)
    const verify = `import { verify } from ${JSON.stringify(join(fixtures, 'verify.ts'))};\n`
    const source =
      runtime === 'vercel'
        ? `${verify}import app from ${JSON.stringify(join(fixtures, 'api/index.ts'))}; await verify(app.fetch); console.log('Verified built Vercel Web Handler (local invocation).');`
        : `${verify}import { server } from ${JSON.stringify(join(fixtures, `${runtime}.ts`))}; try { await verify(request => fetch(request), ${runtime === 'bun' ? 'server.url.origin' : '`http://127.0.0.1:${server.addr.port}`'}); console.log('Verified native ${runtime} HTTP server.'); } finally { await server.${runtime === 'bun' ? 'stop(true)' : 'shutdown()'}; }`
    await writeFile(driver, source)
    await command('bun', ['build', driver, '--target=browser', `--outfile=${entry}`])
    if (runtime === 'deno')
      await command(process.env['DENO_BINARY'] ?? 'deno', [
        'run',
        '--no-config',
        '--no-check',
        '--allow-net=127.0.0.1',
        '--allow-env=PORT',
        entry,
      ])
    else await command(runtime === 'bun' ? 'bun' : 'node', [entry])
  }
} finally {
  await rm(scratch, { recursive: true, force: true })
}
