import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import type { OpenAPIDocstringOptions } from './sidecar'

export type OpenAPIDocstring = {
  readonly summary?: string
  readonly description?: string
  readonly tags?: readonly string[]
  readonly deprecated?: boolean
}

export type OpenAPIDocstrings = Readonly<Record<string, OpenAPIDocstring>>

type ResolvedProperty = {
  readonly declaration: ts.ObjectLiteralElementLike
  readonly initializer: ts.Expression
  readonly documentationNode: ts.Node
}

function sourcePath(source: string | URL): string {
  if (source instanceof URL) {
    if (source.protocol !== 'file:') throw new TypeError('OpenAPI docstring source URL must use the file protocol')
    return fileURLToPath(source)
  }
  return source
}

function unwrapExpression(expression: ts.Expression): ts.Expression {
  let current = expression
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isNonNullExpression(current) ||
    ts.isTypeAssertionExpression(current)
  ) {
    current = current.expression
  }
  return current
}

function propertyName(node: ts.PropertyName | ts.BindingName | undefined): string | undefined {
  if (node === undefined) return undefined
  if (ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node)) return node.text
  return undefined
}

function variableDeclaration(sourceFile: ts.SourceFile, name: string): ts.VariableDeclaration | undefined {
  let found: ts.VariableDeclaration | undefined
  const visit = (node: ts.Node): void => {
    if (found !== undefined) return
    if (ts.isVariableDeclaration(node) && propertyName(node.name) === name && node.initializer !== undefined) {
      found = node
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return found
}

function resolveIdentifier(sourceFile: ts.SourceFile, expression: ts.Expression): ts.Expression {
  const unwrapped = unwrapExpression(expression)
  if (!ts.isIdentifier(unwrapped)) return unwrapped
  const declaration = variableDeclaration(sourceFile, unwrapped.text)
  return declaration?.initializer === undefined ? unwrapped : unwrapExpression(declaration.initializer)
}

function resolveObject(sourceFile: ts.SourceFile, expression: ts.Expression): ts.ObjectLiteralExpression | undefined {
  const resolved = resolveIdentifier(sourceFile, expression)
  return ts.isObjectLiteralExpression(resolved) ? resolved : undefined
}

function resolveProperty(
  sourceFile: ts.SourceFile,
  object: ts.ObjectLiteralExpression,
  name: string
): ResolvedProperty | undefined {
  for (const property of object.properties) {
    if (propertyName(property.name) !== name) continue
    if (ts.isPropertyAssignment(property)) {
      return { declaration: property, initializer: property.initializer, documentationNode: property }
    }
    if (ts.isShorthandPropertyAssignment(property)) {
      const declaration = variableDeclaration(sourceFile, property.name.text)
      if (declaration?.initializer === undefined) return undefined
      return {
        declaration: property,
        initializer: declaration.initializer,
        documentationNode: declaration.parent.parent,
      }
    }
  }
  return undefined
}

function callName(expression: ts.Expression): string | undefined {
  const unwrapped = unwrapExpression(expression)
  if (!ts.isCallExpression(unwrapped)) return undefined
  const target = unwrapped.expression
  if (ts.isIdentifier(target)) return target.text
  if (ts.isPropertyAccessExpression(target)) return target.name.text
  return undefined
}

function callExpression(expression: ts.Expression): ts.CallExpression | undefined {
  const unwrapped = unwrapExpression(expression)
  return ts.isCallExpression(unwrapped) ? unwrapped : undefined
}

function contractRoutesObject(sourceFile: ts.SourceFile, contractName: string): ts.ObjectLiteralExpression | undefined {
  const declaration = variableDeclaration(sourceFile, contractName)
  if (declaration?.initializer === undefined) return undefined
  const call = callExpression(declaration.initializer)
  if (call === undefined || callName(call) !== 'defineContract') return undefined
  const options = call.arguments[0]
  if (options === undefined) return undefined
  const optionsObject = resolveObject(sourceFile, options)
  if (optionsObject === undefined) return undefined
  const routes = resolveProperty(sourceFile, optionsObject, 'routes')
  return routes === undefined ? undefined : resolveObject(sourceFile, routes.initializer)
}

function routerRoutesObject(
  sourceFile: ts.SourceFile,
  routeProperty: ResolvedProperty
): ts.ObjectLiteralExpression | undefined {
  const resolved = resolveIdentifier(sourceFile, routeProperty.initializer)
  const call = callExpression(resolved)
  if (call === undefined || callName(call) !== 'router') return undefined
  const options = call.arguments[1]
  if (options === undefined) return undefined
  const optionsObject = resolveObject(sourceFile, options)
  if (optionsObject === undefined) return undefined
  const routes = resolveProperty(sourceFile, optionsObject, 'routes')
  return routes === undefined ? undefined : resolveObject(sourceFile, routes.initializer)
}

function jsDocText(value: string | ts.NodeArray<ts.JSDocComment> | undefined, sourceFile: ts.SourceFile): string {
  if (value === undefined) return ''
  if (typeof value === 'string') return value.trim()
  return value
    .map((part) => ('text' in part && typeof part.text === 'string' ? part.text : part.getText(sourceFile)))
    .join('')
    .trim()
}

function docstringFor(node: ts.Node, sourceFile: ts.SourceFile): OpenAPIDocstring | undefined {
  const comments = ts.getJSDocCommentsAndTags(node)
  const doc = comments.find(ts.isJSDoc)
  if (doc === undefined) return undefined

  let summary: string | undefined
  let description = jsDocText(doc.comment, sourceFile) || undefined
  const tags: string[] = []
  let deprecated = false

  for (const tag of doc.tags ?? []) {
    const name = tag.tagName.text
    const value = jsDocText(tag.comment, sourceFile)
    if (name === 'summary' && value.length > 0) summary = value
    else if ((name === 'description' || name === 'remarks') && value.length > 0) {
      description = description === undefined ? value : `${description}\n\n${value}`
    } else if (name === 'tag' && value.length > 0) tags.push(value)
    else if (name === 'deprecated') deprecated = true
  }

  if (summary === undefined && description === undefined && tags.length === 0 && !deprecated) return undefined
  return {
    ...(summary === undefined ? {} : { summary }),
    ...(description === undefined ? {} : { description }),
    ...(tags.length === 0 ? {} : { tags }),
    ...(deprecated ? { deprecated: true } : {}),
  }
}

/** Extracts route JSDoc without importing it into the runtime contract. */
export async function extractOpenAPIDocstrings(
  options: OpenAPIDocstringOptions,
  routeKeys: readonly (readonly string[])[]
): Promise<OpenAPIDocstrings> {
  const fileName = sourcePath(options.source)
  const source = await readFile(fileName, 'utf8')
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const routes = contractRoutesObject(sourceFile, options.contract ?? 'contract')
  if (routes === undefined) {
    throw new Error(
      `Could not find defineContract() routes for export "${options.contract ?? 'contract'}" in ${fileName}`
    )
  }

  const result: Record<string, OpenAPIDocstring> = {}
  for (const key of routeKeys) {
    const outer = key[0]
    if (outer === undefined) continue
    const outerProperty = resolveProperty(sourceFile, routes, outer)
    if (outerProperty === undefined) throw new Error(`Could not locate docstring source for route ${key.join('.')}`)

    const property =
      key.length === 1
        ? outerProperty
        : (() => {
            const children = routerRoutesObject(sourceFile, outerProperty)
            const child = key[1]
            return children === undefined || child === undefined
              ? undefined
              : resolveProperty(sourceFile, children, child)
          })()
    if (property === undefined) throw new Error(`Could not locate docstring source for route ${key.join('.')}`)

    const documentation =
      docstringFor(property.declaration, sourceFile) ?? docstringFor(property.documentationNode, sourceFile)
    if (documentation !== undefined) result[key.join('.')] = documentation
  }
  return result
}
