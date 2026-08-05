import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { afterEach, describe, expect, test } from 'vitest'

const testDir = dirname(fileURLToPath(import.meta.url))

const packageRoot = resolve(testDir, '..')
const fixturePath = resolve(testDir, 'fixtures/declaration-input-names.fixture.ts')

const tempDirs: string[] = []

function formatDiagnostics(diagnostics: readonly ts.Diagnostic[]): string[] {
  return diagnostics.map((diagnostic) => {
    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')

    if (!diagnostic.file || diagnostic.start === undefined) {
      return message
    }

    const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start)
    return `${diagnostic.file.fileName}:${line + 1}:${character + 1} ${message}`
  })
}

function emitFixtureDeclaration(): string {
  const configPath = resolve(packageRoot, 'tsconfig.json')
  const configFile = ts.readConfigFile(configPath, ts.sys.readFile)

  if (configFile.error) {
    throw new Error(formatDiagnostics([configFile.error]).join('\n'))
  }

  const parsedConfig = ts.parseJsonConfigFileContent(configFile.config, ts.sys, packageRoot)
  const outDir = mkdtempSync(join(tmpdir(), 'hulla-api-dts-'))

  tempDirs.push(outDir)

  const program = ts.createProgram({
    rootNames: [fixturePath],
    options: {
      ...parsedConfig.options,
      declaration: true,
      emitDeclarationOnly: true,
      noEmit: false,
      noEmitOnError: true,
      outDir,
      rootDir: packageRoot,
    },
  })

  const emitResult = program.emit()
  const diagnostics = [...ts.getPreEmitDiagnostics(program), ...emitResult.diagnostics]

  expect(formatDiagnostics(diagnostics)).toStrictEqual([])

  return readFileSync(resolve(outDir, 'tests/fixtures/declaration-input-names.fixture.d.ts'), 'utf8')
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

describe('declaration emit', () => {
  test('uses "input" as the default parameter label for single-schema procedures', () => {
    const declaration = emitFixtureDeclaration()

    expect(declaration).toContain('export declare const call: (input: string) => string;')
    expect(declaration).toContain('export declare const callProcedure: (input: string) => string;')
    expect(declaration).not.toContain('export declare const call: (args_0')
    expect(declaration).not.toContain('export declare const callProcedure: (args_0')
  })

  test('emits positional client signatures for multiple and optional inputs', () => {
    const declaration = emitFixtureDeclaration()

    expect(declaration).toContain('export declare const callSingleArray: (input: string[]) => string[];')
    expect(declaration).toContain(
      'export declare const callMultiple: (args_0: string, args_1: number) => readonly [string, number];'
    )
    expect(declaration).toContain(
      'export declare const callTrailingOptional: (args_0: string, args_1?: number | undefined) => readonly [string, number | undefined];'
    )
    expect(declaration).toContain(
      'export declare const callOptionalFirst: (args_0: string | undefined, args_1: number) => readonly [string | undefined, number];'
    )
  })

  test('emits user-provided positional argument names', () => {
    const declaration = emitFixtureDeclaration()

    expect(declaration).toContain(
      'export declare const callNamedMultiple: (id: string, patch: number) => [id: string, patch: number];'
    )
    expect(declaration).toContain(
      'export declare const callNamedTrailingOptional: (query: string, limit?: number | undefined) => [query: string, limit?: number | undefined];'
    )
    expect(declaration).toContain(
      'export declare const callNamedOptionalFirst: (query: string | undefined, limit: number) => [query: string | undefined, limit: number];'
    )
  })

  test('preserves positional signatures through client plugin declarations', () => {
    const declaration = emitFixtureDeclaration()

    expect(declaration).toContain(
      'export declare const callProcedureMultiple: (args_0: string, args_1: number) => readonly [string, number];'
    )
    expect(declaration).toContain(
      'export declare const callProcedureTrailingOptional: (args_0: string, args_1?: number | undefined) => readonly [string, number | undefined];'
    )
    expect(declaration).toContain(
      'export declare const callProcedureOptionalFirst: (args_0: string | undefined, args_1: number) => readonly [string | undefined, number];'
    )
  })

  test('emits the same signatures for generated client schemas', () => {
    const declaration = emitFixtureDeclaration()

    expect(declaration).toContain('export declare const generatedCallSingle: (input: string[]) => string[];')
    expect(declaration).toContain(
      'export declare const generatedCallMultiple: (args_0: string, args_1: number) => readonly [string, number];'
    )
    expect(declaration).toContain(
      'export declare const generatedCallTrailingOptional: (args_0: string, args_1?: number | undefined) => readonly [string, number | undefined];'
    )
    expect(declaration).toContain(
      'export declare const generatedCallOptionalFirst: (args_0: string | undefined, args_1: number) => readonly [string | undefined, number];'
    )
  })
})
