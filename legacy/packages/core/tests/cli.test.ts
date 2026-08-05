import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { parseCLIArguments, runCLI } from '../src/cli-main'

describe('hulla api CLI', () => {
  test('parses the default command and explicit project options', () => {
    expect(parseCLIArguments(['api'])).toStrictEqual({ command: 'generate', write: false })
    expect(parseCLIArguments(['api', 'dev', '--config=custom.ts', '--cwd', '/project'])).toStrictEqual({
      command: 'dev',
      config: 'custom.ts',
      cwd: '/project',
      write: false,
    })
    expect(() => parseCLIArguments(['api', 'generate', '--write'])).toThrow('only valid')
    expect(() => parseCLIArguments(['api', 'unknown'])).toThrow('Unknown command')
  })

  test('previews initialization and only writes when requested', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'hulla-cli-init-'))
    const messages: string[] = []

    expect(await runCLI(['api', 'init', '--cwd', cwd], { stdout: (message) => messages.push(message) })).toBe(0)
    expect(existsSync(join(cwd, 'api.config.ts'))).toBe(false)

    expect(
      await runCLI(['api', 'init', '--cwd', cwd, '--write'], { stdout: (message) => messages.push(message) })
    ).toBe(0)
    expect(readFileSync(join(cwd, 'api.config.ts'), 'utf8')).toContain("output: { dir: './src/api/generated' }")
    expect(await runCLI(['api', 'init', '--cwd', cwd, '--write'], { stderr: () => undefined })).toBe(1)
  })

  test('loads JavaScript configs and publishes generated output', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'hulla-cli-generate-'))
    writeFileSync(
      join(cwd, 'api.config.mjs'),
      `export default {
  $hulla: { kind: 'hulla.api.client-config' },
  sources: [],
  routers: false,
  output: { dir: './generated' },
}
`
    )
    const messages: string[] = []

    expect(await runCLI(['api', '--cwd', cwd], { stdout: (message) => messages.push(message) })).toBe(0)
    expect(existsSync(join(cwd, 'generated/.hulla/manifest.json'))).toBe(true)
    expect(messages.at(-1)).toContain(`Generated local routes in ${join(cwd, 'generated')}`)
  })
})
