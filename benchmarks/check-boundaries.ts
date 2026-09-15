import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { isBuiltin } from 'node:module'
import { resolve } from 'node:path'

const root = new URL('../', import.meta.url).pathname
const scratch = await mkdtemp(new URL('./.boundaries-', import.meta.url).pathname)
const contract = `import { defineContract, response, route } from '@hulla/api';
export const contract = defineContract({ routes: { health: route.get('/health', { responses: { 200: response.text() } }) } });`
const client = `import { createClient } from '@hulla/api/client';`
const server = `import { defineServer } from '@hulla/api/server';
const implementation = defineServer(contract).implement({ health: () => ({ status: 200, body: 'ok' }) });`
const verify = `export async function verify() { if ((await client.health()).body !== 'ok') throw new Error('Invalid consumer result'); }`
const httpModules = ['fetch/', 'adapters/web.ts', 'adapters/body.ts', 'adapters/headers.ts']

type Consumer = {
  name: string
  code: string
  required: readonly string[]
  forbidden: readonly string[]
  target?: 'node'
  execute?: boolean
}
const consumers: readonly Consumer[] = [
  {
    name: 'contract',
    code: contract,
    required: ['contract/creation.ts'],
    forbidden: [...httpModules, 'client/', 'server/', 'message-port/'],
  },
  {
    name: 'custom-client',
    code: `${contract}\n${client}
export const client = createClient(contract, { transport: () => ({ status: 200, headers: { 'content-type': 'text/plain' }, readBody: () => 'ok' }) });\n${verify}`,
    required: ['client/creation.ts'],
    forbidden: [...httpModules, 'server/', 'message-port/'],
    execute: true,
  },
  {
    name: 'in-process',
    code: `${contract}\n${client}\n${server}
import { inProcessTransport } from '@hulla/api/in-process';
export const client = createClient(contract, { transport: inProcessTransport(implementation) });\n${verify}`,
    required: ['in-process/index.ts', 'adapters/runtime.ts'],
    forbidden: [...httpModules, 'message-port/'],
    execute: true,
  },
  {
    name: 'message-port-client',
    code: `${contract}\n${client}
import { messagePortTransport, type MessagePortLike } from '@hulla/api-message-port';
export const connect = (port: MessagePortLike) => createClient(contract, { transport: messagePortTransport(port) });`,
    required: ['message-port/client.ts'],
    forbidden: [...httpModules, 'message-port/server.ts', 'adapters/runtime.ts'],
  },
  {
    name: 'websocket-client',
    code: `${contract}\n${client}
import { webSocketTransport, type WebSocketLike } from '@hulla/api-websocket';
export const connect = (socket: WebSocketLike) => createClient(contract, { transport: webSocketTransport(socket) });`,
    required: ['websocket/client.ts'],
    forbidden: [...httpModules, 'websocket/server.ts', 'adapters/runtime.ts'],
  },
  {
    name: 'fetch-client',
    code: `${contract}\n${client}
import { fetchTransport } from '@hulla/api/fetch';
export const client = createClient(contract, { transport: fetchTransport({ baseUrl: 'https://boundary.test', fetch: () => new Response('ok', { headers: { 'content-type': 'text/plain' } }) }) });\n${verify}`,
    required: ['fetch/client.ts', 'adapters/headers.ts'],
    forbidden: ['fetch/server.ts', 'adapters/runtime.ts', 'adapters/web.ts', 'adapters/body.ts', 'message-port/'],
    execute: true,
  },
  {
    name: 'fetch-server',
    code: `${contract}\n${server}
import { fetchAdapter } from '@hulla/api/fetch';
export const handler = fetchAdapter().mount(implementation);
export async function verify() { if (await (await handler(new Request('https://boundary.test/health'))).text() !== 'ok') throw new Error('Invalid server result'); }`,
    required: ['fetch/server.ts', 'adapters/web.ts', 'adapters/body.ts'],
    forbidden: ['fetch/client.ts', 'client/', 'message-port/'],
    execute: true,
  },
  {
    name: 'node-writer',
    code: `export { writeNodeResponse, nodeRequestLifetime } from '@hulla/api-node';`,
    required: ['node/index.ts'],
    forbidden: ['fetch/', 'client/', 'message-port/', 'node/http.ts'],
    target: 'node',
  },
]

type Metafile = {
  outputs: Record<
    string,
    {
      inputs: Record<string, { bytesInOutput: number }>
      imports: readonly { path: string; external?: boolean }[]
    }
  >
}
function command(args: string[]): string {
  const result = spawnSync('bun', args, { cwd: root, encoding: 'utf8', timeout: 120_000 })
  assert.equal(result.status, 0, `${args.join(' ')} failed:\n${result.stdout}\n${result.stderr}`)
  return result.stdout
}
function sourceImports(code: string): string {
  return code
    .replace(/'@hulla\/api-node'/g, `'${resolve(root, 'packages/node/src/index.ts')}'`)
    .replace(/'@hulla\/api-websocket'/g, `'${resolve(root, 'packages/websocket/src/index.ts')}'`)
    .replace(/'@hulla\/api-message-port'/g, `'${resolve(root, 'packages/message-port/src/index.ts')}'`)
    .replace(/'@hulla\/api([^']*)'/g, (_match, subpath: string) => {
      const entry = `${subpath.slice(1) || '.'}/index.ts`
      return `'${resolve(root, 'packages/core/src', entry)}'`
    })
}

try {
  for (const consumer of consumers) {
    for (const mode of ['built', 'source'] as const) {
      const entry = `${scratch}/${consumer.name}-${mode}.ts`
      const output = `${scratch}/${consumer.name}-${mode}.js`
      const metafile = `${output}.json`
      await writeFile(entry, mode === 'built' ? consumer.code : sourceImports(consumer.code))
      command([
        'build',
        entry,
        `--target=${consumer.target ?? 'browser'}`,
        '--minify',
        `--outfile=${output}`,
        `--metafile=${metafile}`,
      ])
      const metadata = JSON.parse(await readFile(metafile, 'utf8')) as Metafile
      const outputs = Object.values(metadata.outputs)
      // Inspect retained contributions, not parsed inputs: an unused sibling export
      // may be resolved by the bundler without contributing any code to the consumer.
      const retained = outputs
        .flatMap((value) => Object.entries(value.inputs))
        .filter(([, value]) => value.bytesInOutput > 0)
        .map(([path]) => resolve(root, path))
      assert(retained.length > 0, `${consumer.name}/${mode}: empty consumer graph`)
      assert(
        outputs.every((value) =>
          value.imports.every((dependency) => consumer.target === 'node' && isBuiltin(dependency.path))
        ),
        `${consumer.name}/${mode}: bundle has unsupported external dependencies`
      )
      if (mode === 'source') {
        const contains = (path: string) =>
          retained.some((input) =>
            input.startsWith(
              path.startsWith('node/')
                ? resolve(root, 'packages/node/src', path.slice('node/'.length))
                : path.startsWith('websocket/')
                  ? resolve(root, 'packages/websocket/src', path.slice('websocket/'.length))
                  : path.startsWith('message-port/')
                    ? resolve(root, 'packages/message-port/src', path.slice('message-port/'.length))
                    : resolve(root, 'packages/core/src', path)
            )
          )
        for (const path of consumer.required)
          assert(contains(path), `${consumer.name}: missing expected implementation ${path}`)
        for (const path of [...consumer.forbidden, ...(consumer.target === 'node' ? [] : ['node/'])])
          assert(!contains(path), `${consumer.name}: retained forbidden implementation ${path}`)
      } else {
        for (const path of [...(consumer.name.startsWith('fetch-') ? [] : ['fetch/index.js'])])
          assert(
            !retained.includes(resolve(root, 'packages/core/dist', path)),
            `${consumer.name}: retained forbidden built entry ${path}`
          )
      }
      if (consumer.name === 'node-writer' && mode === 'built') {
        assert(
          !retained.includes(resolve(root, 'packages/node/dist/http.js')),
          'Node helpers must not retain the standalone HTTP adapter'
        )
      }
      if (consumer.target !== 'node') {
        assert(
          !retained.some((path) => path.startsWith(resolve(root, 'packages/node') + '/')),
          `${consumer.name}: retained optional Node package`
        )
      }
      if (!consumer.name.startsWith('message-port')) {
        assert(
          !retained.some((path) => path.startsWith(resolve(root, 'packages/message-port') + '/')),
          `${consumer.name}: retained the optional MessagePort package`
        )
      }
      if (!consumer.name.startsWith('websocket')) {
        assert(
          !retained.some((path) => path.startsWith(resolve(root, 'packages/websocket') + '/')),
          `${consumer.name}: retained optional WebSocket package`
        )
      }
      if (consumer.execute) command(['--eval', `await (await import(${JSON.stringify(output)})).verify()`])
    }
  }
  console.log(`Verified ${consumers.length} consumer boundaries against source and built browser/Node bundles`)
} finally {
  await rm(scratch, { recursive: true, force: true })
}
