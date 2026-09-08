import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { readdirSync, readFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { join } from 'node:path'

/** Framework production builds must not inherit Vitest's import-protection bypass. */
export function frameworkBuildEnv() {
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1' }
  delete env['TEST']
  delete env['VITEST']
  return env
}

/** Read emitted JavaScript, excluding source maps and unrelated assets. */
export function javascriptOutput(directory: string): string {
  return readdirSync(directory, { withFileTypes: true })
    .map((entry) => {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) return javascriptOutput(path)
      return /\.[cm]?js$/.test(entry.name) ? readFileSync(path, 'utf8') : ''
    })
    .join('\n')
}

export async function startFixture(binary: string, args: (port: number) => string[], cwd: string) {
  const socket = createServer()
  socket.listen(0, '127.0.0.1')
  await once(socket, 'listening')
  const address = socket.address()
  if (address === null || typeof address === 'string') throw new Error('Missing fixture address')
  const port = address.port
  await new Promise<void>((resolve, reject) => socket.close((error) => (error ? reject(error) : resolve())))
  const child = spawn(binary, args(port), {
    cwd,
    env: { ...frameworkBuildEnv(), HOST: '127.0.0.1', PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  let spawnError: Error | undefined
  child.on('error', (error) => {
    spawnError = error
  })
  child.stdout.on('data', (chunk) => {
    output += String(chunk)
  })
  child.stderr.on('data', (chunk) => {
    output += String(chunk)
  })
  const stop = async () => {
    if (child.pid === undefined || child.exitCode !== null || child.signalCode !== null) return
    const exited = once(child, 'exit')
    child.kill('SIGTERM')
    const force = setTimeout(() => child.kill('SIGKILL'), 5_000)
    try {
      await exited
    } finally {
      clearTimeout(force)
    }
  }
  const origin = `http://127.0.0.1:${port}`
  try {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (spawnError !== undefined) throw spawnError
      if (child.exitCode !== null) throw new Error(`Fixture exited: ${output}`)
      try {
        const response = await fetch(origin, { signal: AbortSignal.timeout(2_000) })
        await response.arrayBuffer()
        return { origin, stop, output: () => output }
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 50))
      }
    }
    throw new Error(`Fixture did not start: ${output}`)
  } catch (error) {
    await stop()
    throw error
  }
}
