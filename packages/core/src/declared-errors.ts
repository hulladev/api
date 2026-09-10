import type { JsonValue } from './contract/representation'
import { isRecord, setOwn } from './object'
import { isSchema, type AnySchema, type SchemaOutput, type SchemaOutbound, type SchemaWireOutput } from './validation'

const errorDeclaration = Symbol('hulla.error-declaration')

export type ErrorDefinition<Data extends AnySchema | undefined = AnySchema | undefined> = {
  readonly message?: string
  readonly data?: Data
}

export type ErrorDefinitions = Readonly<Record<string, ErrorDefinition>>

export type DeclaredErrorOptions<Data> = {
  readonly cause?: unknown
  readonly data: Data
  readonly message?: string
}

export type DeclaredErrorOptionsWithoutData = {
  readonly cause?: unknown
  readonly message?: string
}

export type AnyErrorDeclaration = {
  (...arguments_: any[]): DeclaredError<string, unknown>
  readonly kind: 'error'
  readonly code: string
  readonly message: string
  readonly data: AnySchema | undefined
  readonly [errorDeclaration]: true
}

export class DeclaredError<Code extends string = string, Data = undefined> extends Error {
  readonly code: Code
  readonly data: Data
  readonly declaration: AnyErrorDeclaration

  /** @internal Error occurrences are normally created by their declaration factory. */
  constructor(declaration: AnyErrorDeclaration, data: Data, message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'DeclaredError'
    this.code = declaration.code as Code
    this.data = data
    this.declaration = declaration
  }
}

type ErrorArguments<Data extends AnySchema | undefined> = Data extends AnySchema
  ? [options: DeclaredErrorOptions<SchemaOutbound<Data>>]
  : [options?: DeclaredErrorOptionsWithoutData]

export type ErrorDeclaration<
  Code extends string = string,
  Data extends AnySchema | undefined = AnySchema | undefined,
> = {
  (...arguments_: ErrorArguments<Data>): DeclaredError<Code, Data extends AnySchema ? SchemaOutbound<Data> : undefined>
  readonly kind: 'error'
  readonly code: Code
  readonly message: string
  readonly data: Data
  readonly [errorDeclaration]: true
}

export type DefinedErrors<Definitions extends ErrorDefinitions> = {
  readonly [Code in keyof Definitions]: ErrorDeclaration<
    Extract<Code, string>,
    Definitions[Code]['data'] extends AnySchema ? Definitions[Code]['data'] : undefined
  >
}

function createErrorDeclaration<Code extends string>(code: Code, definition: ErrorDefinition): AnyErrorDeclaration {
  const message = definition.message ?? code
  const declaration = ((options: Readonly<Record<string, unknown>> = {}) => {
    if (!isRecord(options)) throw new TypeError(`Error ${code} options must be an object`)
    const resolvedMessage = options['message'] ?? message
    if (typeof resolvedMessage !== 'string') throw new TypeError(`Error ${code} message must be a string`)
    if (definition.data !== undefined && !('data' in options)) throw new TypeError(`Error ${code} requires data`)
    const cause = options['cause']
    return new DeclaredError(declaration, options['data'], resolvedMessage, cause === undefined ? undefined : { cause })
  }) as AnyErrorDeclaration

  Object.defineProperties(declaration, {
    kind: { value: 'error', enumerable: true },
    code: { value: code, enumerable: true },
    message: { value: message, enumerable: true },
    data: { value: definition.data, enumerable: true },
    [errorDeclaration]: { value: true },
  })
  return declaration
}

/** Defines a named group of independently reusable, transport-neutral error factories. */
export function defineErrors<const Definitions extends ErrorDefinitions>(
  definitions: Definitions & {
    readonly [Code in keyof Definitions]: Definitions[Code]['data'] extends AnySchema
      ? SchemaWireOutput<Definitions[Code]['data']> extends JsonValue
        ? Definitions[Code]
        : never
      : Definitions[Code]
  }
): DefinedErrors<Definitions> {
  if (!isRecord(definitions)) throw new TypeError('Error definitions must be an object')
  const errors: Record<string, AnyErrorDeclaration> = {}
  for (const [code, definition] of Object.entries(definitions)) {
    if (code.length === 0) throw new TypeError('Error code must not be empty')
    if (!isRecord(definition)) throw new TypeError(`Error ${code} definition must be an object`)
    if (definition['message'] !== undefined && typeof definition['message'] !== 'string') {
      throw new TypeError(`Error ${code} message must be a string`)
    }
    if (definition['data'] !== undefined && !isSchema(definition['data'])) {
      throw new TypeError(`Error ${code} data must be a Standard Schema`)
    }
    setOwn(errors, code, createErrorDeclaration(code, definition))
  }
  return errors as unknown as DefinedErrors<Definitions>
}

export function isErrorDeclaration(value: unknown): value is AnyErrorDeclaration {
  return typeof value === 'function' && (value as Partial<AnyErrorDeclaration>)[errorDeclaration] === true
}

export function isDeclaredError(value: unknown): value is DeclaredError<string, unknown> {
  return value instanceof DeclaredError && isErrorDeclaration(value.declaration)
}

export type ErrorStatusMap = Readonly<Record<number, AnyErrorDeclaration | readonly AnyErrorDeclaration[]>>

type NormalizedErrorEntry<Entry> = Entry extends readonly AnyErrorDeclaration[]
  ? Entry
  : Entry extends AnyErrorDeclaration
    ? readonly [Entry]
    : never

export type NormalizedErrorStatusMap<Errors extends ErrorStatusMap = ErrorStatusMap> = {
  readonly [Status in keyof Errors]: NormalizedErrorEntry<Errors[Status]>
}

type ErrorDeclarationWire<Declaration> =
  Declaration extends ErrorDeclaration<infer Code, infer Data>
    ? { readonly code: Code; readonly message: string } & (Data extends AnySchema
        ? { readonly data: SchemaOutput<Data> }
        : { readonly data?: never })
    : never

export type ErrorWire<Errors extends readonly AnyErrorDeclaration[]> = ErrorDeclarationWire<Errors[number]>

type ErrorDeclarationIn<Errors extends NormalizedErrorStatusMap> = Errors[Extract<keyof Errors, number>][number]

export type ErrorFactories<Errors extends NormalizedErrorStatusMap> = {
  readonly [Declaration in ErrorDeclarationIn<Errors> as Declaration['code']]: Declaration
}

export type ErrorFactoryField<Errors extends NormalizedErrorStatusMap> =
  Extract<keyof Errors, number> extends never
    ? { readonly errors?: never }
    : { readonly errors: ErrorFactories<Errors> }

export type ErrorInstance<Errors extends NormalizedErrorStatusMap> = ReturnType<ErrorDeclarationIn<Errors>>

export type ClientErrorResponseResult<Errors extends NormalizedErrorStatusMap> = {
  readonly [Status in Extract<keyof Errors, number>]: {
    readonly status: Status
    readonly headers: Readonly<Record<string, string>>
    readonly body: ErrorWire<Errors[Status]>
  }
}[Extract<keyof Errors, number>]

export type ClientErrorMode = 'return' | 'throw'

export function errorFactories<const Errors extends NormalizedErrorStatusMap>(errors: Errors): ErrorFactories<Errors> {
  const factories: Record<string, AnyErrorDeclaration> = {}
  for (const declarations of Object.values(errors)) {
    for (const declaration of declarations) setOwn(factories, declaration.code, declaration)
  }
  return Object.freeze(factories) as ErrorFactories<Errors>
}
