import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { WEBSOCKET_PROTOCOL, webSocketTransport, webSocketAdapter } from '@hulla/api-websocket'
const core = JSON.parse(await readFile(new URL('../packages/core/package.json', import.meta.url), 'utf8')) as {
  name: string
  exports: Record<string, { import: string }>
  dependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
}
for (const name of ['message-port', 'websocket', 'nestjs']) {
  assert(!Object.hasOwn(core.exports, `./${name}`), `${name} must be installed separately`)
  for (const dependencies of [core.dependencies, core.peerDependencies])
    assert(!Object.hasOwn(dependencies ?? {}, `@hulla/api-${name}`), `Core must not depend on ${name}`)
}
for (const dependencies of [core.dependencies, core.optionalDependencies, core.peerDependencies]) {
  assert(!Object.hasOwn(dependencies ?? {}, '@hulla/api-message-port'), 'Core must not depend on MessagePort')
}
for (const subpath of Object.keys(core.exports)) {
  const module = await import(`${core.name}${subpath === '.' ? '' : subpath.slice(1)}`)
  assert(Object.keys(module).length > 0, `Empty built export: ${subpath}`)
}
const { defineContract, response, route } = await import('@hulla/api')
const { defineClient } = await import('@hulla/api/client')
const { defineServer } = await import('@hulla/api/server')
const { fetchAdapter, fetchTransport } = await import('@hulla/api/fetch')
const contract = defineContract({ routes: { health: route.get('/', { responses: { 200: response.json() } }) } })
const implementation = defineServer(contract).implement({ health: () => ({ status: 200, body: { ok: true } }) })
const client = defineClient(contract, {
  transport: fetchTransport({ baseUrl: 'https://exports.test', fetch: fetchAdapter().mount(implementation) }),
})
assert.deepEqual((await client.health()).body, { ok: true })
console.log(
  `Imported ${Object.keys(core.exports).length} built core entrypoints and executed a public client/server roundtrip`
)

const { MessageChannel } = await import('node:worker_threads')
const { messagePortAdapter, messagePortTransport } = await import('@hulla/api-message-port')
const channel = new MessageChannel()
const mounted = messagePortAdapter(channel.port1).mount(implementation)
const transport = messagePortTransport(channel.port2)
try {
  const ipcClient = defineClient(contract, { transport })
  assert.deepEqual((await ipcClient.health()).body, { ok: true })
} finally {
  await transport.close()
  await mounted.close()
  channel.port1.close()
  channel.port2.close()
}
console.log('Executed a built MessagePort package roundtrip with the shared core instance')

// Declaration emission is a separate consumer boundary from library typechecking.
const { mkdtemp, rm, writeFile } = await import('node:fs/promises')
const { spawnSync } = await import('node:child_process')
const scratch = await mkdtemp(new URL('./.consumer-', import.meta.url).pathname)
try {
  const path = `${scratch}/consumer.ts`
  await writeFile(
    path,
    `import { defineContract, response, route, router } from '@hulla/api';
import { defineClient } from '@hulla/api/client';
import { defineServer } from '@hulla/api/server';
import { messagePortTransport, type MessagePortLike } from '@hulla/api-message-port';
export const connect = (port: MessagePortLike) => defineClient(contract, { transport: messagePortTransport(port) });
const contract = defineContract({ routes: { health: route.get('/', { responses: { 200: response.text(), 404: response.empty() } }), group: router('/group', { routes: { get: route.get('/', { responses: { 200: response.text() } }) } }) } });
export const client = defineClient(contract, { transport: () => { throw new Error() } });
export const selected = client.select(contract.routes.health);
export const nested = client.select(contract.routes.group.get);
export const composed = client.compose(selected, nested);
export const partial = defineServer(contract).implement(contract.routes.health, () => ({ status: 200, body: 'ok' }));
const reserved = defineContract({ routes: { use: route.get('/', { responses: { 200: response.empty() } }) } });
// @ts-expect-error Client authoring root names are reserved.
defineClient(reserved, { transport: () => { throw new Error() } });
`
  )
  const result = spawnSync(
    'bun',
    [
      'x',
      '--no-install',
      'tsc',
      '--ignoreConfig',
      '--declaration',
      '--emitDeclarationOnly',
      '--strict',
      '--skipLibCheck',
      '--target',
      'ES2022',
      '--module',
      'NodeNext',
      '--moduleResolution',
      'NodeNext',
      '--outDir',
      `${scratch}/dist`,
      path,
    ],
    { encoding: 'utf8', timeout: 120000 }
  )
  assert.equal(result.status, 0, `Public consumer declaration emission failed:\n${result.stdout}\n${result.stderr}`)
  console.log('Emitted public client, selection, composition and server-fragment declarations')
} finally {
  await rm(scratch, { recursive: true, force: true })
}

await import('./check-boundaries')

assert.equal(WEBSOCKET_PROTOCOL, '@hulla/api-websocket/1')
assert.equal(typeof webSocketTransport, 'function')
assert.equal(typeof webSocketAdapter, 'function')
