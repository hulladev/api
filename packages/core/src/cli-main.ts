import { watch, type FSWatcher } from 'node:fs'
import { access, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, extname, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createJiti } from 'jiti'
import { runGenerateConfig, type APIClientGenerateConfig, type RunGenerateConfigResult } from './generate'

const configNames = [
  'api.config.ts',
  'api.config.mts',
  'api.config.cts',
  'api.config.js',
  'api.config.mjs',
  'api.config.cjs',
]

export type CLICommand = 'generate' | 'dev' | 'init' | 'help'

export type CLIArguments = {
  readonly command: CLICommand
  readonly config?: string
  readonly cwd?: string
  readonly write: boolean
}

export type CLIRuntime = {
  readonly stdout?: (message: string) => void
  readonly stderr?: (message: string) => void
}

export function parseCLIArguments(argv: readonly string[]): CLIArguments {
  const args = argv[0] === 'api' ? argv.slice(1) : [...argv]
  let command: CLICommand = 'generate'
  let config: string | undefined
  let cwd: string | undefined
  let write = false
  let commandSeen = false

  for (let index = 0; index < args.length; index++) {
    const argument = args[index]!
    const [name, inlineValue] = argument.split('=', 2)
    if (name === '-h' || name === '--help') {
      command = 'help'
      continue
    }
    if (name === '-c' || name === '--config') {
      config = optionValue(name, inlineValue ?? args[++index])
      continue
    }
    if (name === '--cwd') {
      cwd = optionValue(name, inlineValue ?? args[++index])
      continue
    }
    if (name === '--write') {
      write = true
      continue
    }
    if (argument.startsWith('-')) throw new Error(`Unknown option "${argument}".`)
    if (commandSeen) throw new Error(`Unexpected argument "${argument}".`)
    if (argument !== 'generate' && argument !== 'dev' && argument !== 'init' && argument !== 'help') {
      throw new Error(`Unknown command "${argument}".`)
    }
    command = argument
    commandSeen = true
  }

  if (write && command !== 'init') throw new Error('--write is only valid with "hulla api init".')
  return {
    command,
    ...(config === undefined ? {} : { config }),
    ...(cwd === undefined ? {} : { cwd }),
    write,
  }
}

export async function runCLI(argv: readonly string[], runtime: CLIRuntime = {}): Promise<number> {
  const stdout = runtime.stdout ?? console.log
  const stderr = runtime.stderr ?? console.error
  let options: CLIArguments
  try {
    options = parseCLIArguments(argv)
  } catch (error) {
    stderr(errorMessage(error))
    stderr(usage())
    return 1
  }

  if (options.command === 'help') {
    stdout(usage())
    return 0
  }

  const cwd = resolve(options.cwd ?? process.cwd())
  try {
    if (options.command === 'init') {
      await initializeProject(cwd, options.config, options.write, stdout)
      return 0
    }

    const configPath = await resolveConfigPath(cwd, options.config)
    if (options.command === 'dev') {
      await runDev(cwd, configPath, stdout, stderr)
      return 0
    }

    const result = await generateFromFile(cwd, configPath)
    stdout(generationSummary(result))
    return 0
  } catch (error) {
    stderr(errorMessage(error))
    return 1
  }
}

async function generateFromFile(cwd: string, configPath: string): Promise<RunGenerateConfigResult> {
  const config = await loadConfig(configPath)
  return runGenerateConfig(config, { cwd, configPath })
}

async function loadConfig(configPath: string): Promise<APIClientGenerateConfig> {
  const jiti = createJiti(pathToFileURL(configPath).href, { moduleCache: false, fsCache: false })
  const config = await jiti.import<unknown>(configPath, { default: true })
  if (!isGenerateConfig(config)) {
    throw new Error(`${configPath} must default-export the result of generate(...).`)
  }
  return config
}

function isGenerateConfig(value: unknown): value is APIClientGenerateConfig {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { $hulla?: { kind?: unknown } }).$hulla?.kind === 'hulla.api.client-config' &&
    typeof (value as { output?: { dir?: unknown } }).output?.dir === 'string' &&
    Array.isArray((value as { sources?: unknown }).sources)
  )
}

async function resolveConfigPath(cwd: string, configured?: string): Promise<string> {
  if (configured !== undefined) {
    const path = resolve(cwd, configured)
    await access(path).catch(() => {
      throw new Error(`API config not found: ${path}`)
    })
    return path
  }
  for (const name of configNames) {
    const path = join(cwd, name)
    try {
      await access(path)
      return path
    } catch {}
  }
  throw new Error(`No API config found in ${cwd}. Run "hulla api init" or pass --config.`)
}

async function initializeProject(
  cwd: string,
  configured: string | undefined,
  write: boolean,
  stdout: (message: string) => void
): Promise<void> {
  const configPath = resolve(cwd, configured ?? 'api.config.ts')
  try {
    await access(configPath)
    throw new Error(`Refusing to overwrite existing config: ${configPath}`)
  } catch (error) {
    if ((error as { code?: string }).code !== 'ENOENT') throw error
  }

  const drizzle = await detectDrizzle(cwd)
  const source = drizzle
    ? [
        "import { generate } from '@hulla/api'",
        "import { fromDrizzle } from '@hulla/api-drizzle'",
        '',
        'export default generate({',
        "  sources: [fromDrizzle({ routes: 'all' })],",
        "  output: { dir: './src/api/generated' },",
        '})',
        '',
      ].join('\n')
    : [
        "import { generate } from '@hulla/api'",
        '',
        'export default generate({',
        '  sources: [],',
        "  output: { dir: './src/api/generated' },",
        '})',
        '',
      ].join('\n')

  if (!write) {
    stdout(
      `Proposed ${relative(cwd, configPath) || configPath}:\n\n${source}\nRun "hulla api init --write" to create it.`
    )
    return
  }
  await mkdir(dirname(configPath), { recursive: true })
  await writeFile(configPath, source, { flag: 'wx' })
  stdout(`Created ${relative(cwd, configPath) || configPath}.`)
}

async function detectDrizzle(cwd: string): Promise<boolean> {
  const packagePath = join(cwd, 'package.json')
  try {
    const packageJSON = JSON.parse(await readFile(packagePath, 'utf8')) as {
      dependencies?: Record<string, unknown>
      devDependencies?: Record<string, unknown>
    }
    const dependencies = { ...packageJSON.dependencies, ...packageJSON.devDependencies }
    if (!('@hulla/api-drizzle' in dependencies)) return false
    return (
      await Promise.all(['drizzle.config.ts', 'drizzle.config.js', 'drizzle.config.mts'].map(fileExistsAt(cwd)))
    ).some(Boolean)
  } catch {
    return false
  }
}

function fileExistsAt(cwd: string): (name: string) => Promise<boolean> {
  return async (name) => {
    try {
      await access(join(cwd, name))
      return true
    } catch {
      return false
    }
  }
}

async function runDev(
  cwd: string,
  configPath: string,
  stdout: (message: string) => void,
  stderr: (message: string) => void
): Promise<void> {
  let watchers: FSWatcher[] = []
  let timer: ReturnType<typeof setTimeout> | undefined
  let generating = false
  let queued = false
  let loadedConfig: APIClientGenerateConfig | undefined

  const regenerate = async () => {
    if (generating) {
      queued = true
      return
    }
    generating = true
    try {
      const config = await loadConfig(configPath)
      loadedConfig = config
      const result = await runGenerateConfig(config, { cwd, configPath })
      for (const watcher of watchers) watcher.close()
      watchers = await createWatchers(cwd, configPath, config, result, schedule)
      stdout(`${generationSummary(result)} Watching ${watchers.length} inputs.`)
    } catch (error) {
      stderr(`Generation failed: ${errorMessage(error)}`)
      if (watchers.length === 0) {
        const ignored = loadedConfig ? resolve(cwd, loadedConfig.output.dir) : join(cwd, '.hulla-api-no-output')
        watchers = await watchTargets(await walkDirectories(cwd, ignored), schedule)
        stderr(`Watching ${watchers.length} project directories for a fix.`)
      }
    } finally {
      generating = false
      if (queued) {
        queued = false
        await regenerate()
      }
    }
  }
  const schedule = () => {
    if (timer !== undefined) clearTimeout(timer)
    timer = setTimeout(() => void regenerate(), 75)
  }

  await regenerate()
  await new Promise<void>((done) => {
    const stop = () => {
      if (timer !== undefined) clearTimeout(timer)
      for (const watcher of watchers) watcher.close()
      process.off('SIGINT', stop)
      process.off('SIGTERM', stop)
      done()
    }
    process.on('SIGINT', stop)
    process.on('SIGTERM', stop)
  })
}

async function createWatchers(
  cwd: string,
  configPath: string,
  config: APIClientGenerateConfig,
  result: RunGenerateConfigResult,
  changed: () => void
): Promise<FSWatcher[]> {
  const outputDir = resolve(cwd, config.output.dir)
  const targets = new Set<string>([configPath])
  for (const source of result.sources) {
    for (const input of source.inputs ?? []) targets.add(resolve(cwd, input))
    for (const pattern of source.inputGlobs ?? []) {
      const root = globRoot(cwd, pattern)
      for (const directory of await walkDirectories(root, outputDir)) targets.add(directory)
    }
  }
  if (config.routers !== false) {
    const routerRoot = resolve(cwd, config.routers?.dir ?? 'src/api')
    for (const directory of await walkDirectories(routerRoot, outputDir)) targets.add(directory)
  }

  return watchTargets(targets, changed)
}

function watchTargets(targets: Iterable<string>, changed: () => void): FSWatcher[] {
  return [...targets].flatMap((target) => {
    try {
      const watcher = watch(target, { persistent: true }, changed)
      watcher.on('error', () => {
        watcher.close()
        changed()
      })
      return [watcher]
    } catch (error) {
      if ((error as { code?: string }).code === 'ENOENT') return []
      throw error
    }
  })
}

function globRoot(cwd: string, pattern: string): string {
  const normalized = pattern.replace(/\\/g, '/')
  const wildcard = normalized.search(/[!*?{[(]/)
  const stable = wildcard === -1 ? normalized : normalized.slice(0, wildcard)
  const root = stable.endsWith('/') || extname(stable) === '' ? stable : dirname(stable)
  return resolve(cwd, root || '.')
}

async function walkDirectories(root: string, ignored: string): Promise<string[]> {
  if (root === ignored || root.startsWith(`${ignored}/`)) return []
  let entries
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch (error) {
    if ((error as { code?: string }).code === 'ENOENT') return []
    throw error
  }
  const directories = [root]
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === 'node_modules' || entry.name.startsWith('.')) continue
    const path = join(root, entry.name)
    if (path === ignored || path.startsWith(`${ignored}/`)) continue
    directories.push(...(await walkDirectories(path, ignored)))
  }
  return directories
}

function generationSummary(result: RunGenerateConfigResult): string {
  const names = result.sources.map((source) => source.name).join(', ') || 'local routes'
  return `Generated ${names} in ${result.outputDir}.`
}

function optionValue(name: string, value: string | undefined): string {
  if (value === undefined || value.startsWith('-')) throw new Error(`${name} requires a value.`)
  return value
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function usage(): string {
  return [
    'Usage: hulla api [generate|dev|init] [options]',
    '',
    'Commands:',
    '  generate   Generate the configured clients (default)',
    '  dev        Regenerate when declared source inputs change',
    '  init       Preview a minimal api.config.ts; add --write to create it',
    '',
    'Options:',
    '  -c, --config <path>  Use a specific config file',
    '  --cwd <path>         Use a specific project directory',
    '  -h, --help           Show this help',
  ].join('\n')
}
