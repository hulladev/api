import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Code, type CodeFocus } from './Code'

export type LessonFocus = CodeFocus & {
  path: string
}

export type LessonFile = {
  path: string
  source: string
  badge?: 'your code' | 'generated' | 'contract'
  highlightLines?: readonly number[]
  addedLines?: readonly number[]
  removedLines?: readonly number[]
  status?: 'new' | 'changed' | 'removed'
}

type TreeFolder = { kind: 'folder'; name: string; path: string; children: TreeNode[] }
type TreeFile = { kind: 'file'; name: string; path: string; file: LessonFile }
type TreeNode = TreeFolder | TreeFile

export function Workspace({
  files,
  projectFiles = files,
  initialPath,
  focus,
  revealPath,
}: {
  files: readonly LessonFile[]
  projectFiles?: readonly LessonFile[]
  initialPath?: string
  focus?: LessonFocus
  revealPath?: string
}) {
  const [selectedPath, setSelectedPath] = useState(initialPath ?? files[0]?.path ?? '')
  const mergedFiles = useMemo(() => {
    const lessonByPath = new Map(files.map((file) => [file.path, file]))
    return projectFiles.map((file) => lessonByPath.get(file.path) ?? file)
  }, [files, projectFiles])
  const selected = mergedFiles.find((file) => file.path === selectedPath) ?? files[0]
  const editorFiles = useMemo(
    () => collectEditorFiles(selected ? [...files, selected] : files, mergedFiles),
    [files, mergedFiles, selected]
  )
  const models = useMemo(() => editorFiles.map((file) => [file.path, file.source] as const), [editorFiles])
  const relevantPaths = useMemo(() => new Set(files.map((file) => file.path)), [files])
  const tree = useMemo(() => buildTree(mergedFiles), [mergedFiles])
  const revealAvailable = Boolean(revealPath && mergedFiles.some((file) => file.path === revealPath))
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set())
  const restorePath = useRef<string | null>(null)
  const previousFocus = useRef<LessonFocus | undefined>(undefined)

  useEffect(() => {
    if (focus && mergedFiles.some((file) => file.path === focus.path)) {
      if (!previousFocus.current) restorePath.current = selectedPath
      setSelectedPath(focus.path)
    } else if (!focus && previousFocus.current && restorePath.current) {
      setSelectedPath(restorePath.current)
      restorePath.current = null
    }

    previousFocus.current = focus
  }, [focus, mergedFiles, selectedPath])

  useEffect(() => {
    if (revealPath && revealAvailable) setSelectedPath(revealPath)
  }, [revealAvailable, revealPath])

  if (!selected) return null

  return (
    <div className="lesson-workspace">
      <aside className="lesson-tree" aria-label="Files in this lesson">
        <header>
          <span>EXPLORER</span>
          <small>{mergedFiles.length} files</small>
        </header>
        <div className="tree-root">demo</div>
        <div className="tree-nodes">
          <TreeNodes
            nodes={tree}
            depth={0}
            collapsed={collapsed}
            selectedPath={selected.path}
            relevantPaths={relevantPaths}
            onFolder={(path) =>
              setCollapsed((current) => {
                const next = new Set(current)
                if (next.has(path)) next.delete(path)
                else next.add(path)
                return next
              })
            }
            onFile={setSelectedPath}
          />
        </div>
      </aside>
      <Code
        filename={selected.path}
        highlightLines={selected.highlightLines}
        addedLines={selected.addedLines}
        removedLines={selected.removedLines}
        projectFiles={models}
        readOnly={selected.badge === 'generated'}
        focus={focus?.path === selected.path ? focus : undefined}
      >
        {selected.source}
      </Code>
    </div>
  )
}

function TreeNodes({
  nodes,
  depth,
  collapsed,
  selectedPath,
  relevantPaths,
  onFolder,
  onFile,
}: {
  nodes: readonly TreeNode[]
  depth: number
  collapsed: ReadonlySet<string>
  selectedPath: string
  relevantPaths: ReadonlySet<string>
  onFolder: (path: string) => void
  onFile: (path: string) => void
}) {
  return nodes.map((node) => {
    if (node.kind === 'folder') {
      const isCollapsed = collapsed.has(node.path)
      return (
        <div className="tree-branch" key={node.path}>
          <button
            aria-expanded={!isCollapsed}
            className="tree-folder"
            onClick={() => onFolder(node.path)}
            style={{ paddingLeft: 12 + depth * 12 }}
            type="button"
          >
            <span>{isCollapsed ? '›' : '⌄'}</span>
            {node.name}
          </button>
          {!isCollapsed ? (
            <TreeNodes
              nodes={node.children}
              depth={depth + 1}
              collapsed={collapsed}
              selectedPath={selectedPath}
              relevantPaths={relevantPaths}
              onFolder={onFolder}
              onFile={onFile}
            />
          ) : null}
        </div>
      )
    }

    const { file } = node
    const classes = [
      'tree-file',
      file.path === selectedPath ? 'active' : '',
      relevantPaths.has(file.path) ? 'relevant' : '',
      file.status ? `status-${file.status}` : '',
    ]
      .filter(Boolean)
      .join(' ')
    const revealOrder = file.path.includes('/generated/') ? 0 : 1
    const style = {
      paddingLeft: 20 + depth * 12,
      '--file-reveal-delay': `${260 + revealOrder * 230}ms`,
    } as CSSProperties

    return (
      <button
        className={classes}
        disabled={file.status === 'removed'}
        key={file.path}
        onClick={() => onFile(file.path)}
        style={style}
        type="button"
      >
        <i>{file.path.endsWith('.json') ? '{}' : file.path.endsWith('.tsx') ? 'TX' : 'TS'}</i>
        <span>{node.name}</span>
        {file.status ? <em className={`change-badge ${file.status}`}>{file.status}</em> : null}
        {!file.status && file.badge && file.badge !== 'your code' ? (
          <em className={`file-badge ${file.badge}`}>{file.badge}</em>
        ) : null}
      </button>
    )
  })
}

function buildTree(files: readonly LessonFile[]) {
  const root: TreeFolder = { kind: 'folder', name: 'demo', path: '', children: [] }

  for (const file of files) {
    const segments = file.path.split('/')
    let folder = root

    for (const [index, segment] of segments.entries()) {
      const path = segments.slice(0, index + 1).join('/')
      if (index === segments.length - 1) {
        folder.children.push({ kind: 'file', name: segment, path, file })
        continue
      }

      let child = folder.children.find(
        (candidate): candidate is TreeFolder => candidate.kind === 'folder' && candidate.name === segment
      )
      if (!child) {
        child = { kind: 'folder', name: segment, path, children: [] }
        folder.children.push(child)
      }
      folder = child
    }
  }

  sortTree(root.children)
  return root.children
}

function sortTree(nodes: TreeNode[]) {
  nodes.sort((left, right) => {
    if (left.kind !== right.kind) return left.kind === 'folder' ? -1 : 1
    return left.name.localeCompare(right.name)
  })
  for (const node of nodes) if (node.kind === 'folder') sortTree(node.children)
}

function collectEditorFiles(seedFiles: readonly LessonFile[], projectFiles: readonly LessonFile[]) {
  const project = new Map(projectFiles.map((file) => [file.path, file]))
  const collected = new Map<string, LessonFile>()
  const queue = [...seedFiles]

  while (queue.length > 0) {
    const file = queue.shift()
    if (!file || collected.has(file.path)) continue
    collected.set(file.path, file)

    for (const specifier of relativeImportSpecifiers(file.source)) {
      const dependency = resolveProjectImport(file.path, specifier, project)
      if (dependency && !collected.has(dependency.path)) queue.push(dependency)
    }
  }

  return [...collected.values()]
}

function relativeImportSpecifiers(source: string) {
  return [
    ...source.matchAll(/\bfrom\s+['"](\.[^'"]+)['"]/g),
    ...source.matchAll(/\bimport\s*\(\s*['"](\.[^'"]+)['"]\s*\)/g),
  ].map((match) => match[1])
}

function resolveProjectImport(path: string, specifier: string, project: ReadonlyMap<string, LessonFile>) {
  const directory = path.split('/').slice(0, -1)
  const segments = [...directory, ...specifier.split('/')]
  const normalized: string[] = []

  for (const segment of segments) {
    if (segment === '.' || segment === '') continue
    if (segment === '..') normalized.pop()
    else normalized.push(segment)
  }

  const base = normalized.join('/')
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) {
    const dependency = project.get(candidate)
    if (dependency) return dependency
  }

  return undefined
}
