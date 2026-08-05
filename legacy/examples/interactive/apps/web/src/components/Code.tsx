import type { editor } from 'monaco-editor'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { editorProjectFiles } from '../editor-project'

const emptyHighlightLines: readonly number[] = []
const emptyProjectFiles: readonly (readonly [path: string, source: string])[] = []

export type CodeFocus = {
  from: number
  to: number
}

export function Code({
  children,
  filename = 'example.ts',
  highlightLines = emptyHighlightLines,
  addedLines = emptyHighlightLines,
  removedLines = emptyHighlightLines,
  projectFiles = emptyProjectFiles,
  readOnly = false,
  resettable = true,
  height: requestedHeight,
  onChange,
  panel,
  focus,
}: {
  children: string
  filename?: string
  highlightLines?: readonly number[]
  addedLines?: readonly number[]
  removedLines?: readonly number[]
  projectFiles?: readonly (readonly [path: string, source: string])[]
  readOnly?: boolean
  resettable?: boolean
  height?: number
  onChange?: (source: string) => void
  panel?: ReactNode
  focus?: CodeFocus
}) {
  const container = useRef<HTMLDivElement>(null)
  const editor = useRef<editor.IStandaloneCodeEditor | null>(null)
  const model = useRef<editor.ITextModel | null>(null)
  const supportModels = useRef<editor.ITextModel[]>([])
  const decorations = useRef<editor.IEditorDecorationsCollection | null>(null)
  const source = useRef(children)
  const onChangeRef = useRef(onChange)
  const applyingExternalChange = useRef(false)
  const id = useId().replaceAll(':', '-')
  const [ready, setReady] = useState(false)
  const height = requestedHeight ?? Math.min(640, Math.max(380, children.split('\n').length * 25 + 110))
  const inspectOnly = readOnly

  source.current = children
  onChangeRef.current = onChange

  useEffect(() => {
    let cancelled = false
    let resizeObserver: ResizeObserver | undefined

    setReady(false)

    void import('../editor').then(({ configureMonaco }) => {
      if (cancelled || !container.current) return
      const monaco = configureMonaco()
      const safeFilename = filename.replaceAll(/[^a-zA-Z0-9._/-]/g, '-')
      const labRoot = `file:///labs/${id}`
      const lessonPaths = new Set(projectFiles.map(([path]) => path))
      supportModels.current = [...editorProjectFiles.filter(([path]) => !lessonPaths.has(path)), ...projectFiles]
        .filter(([path]) => path !== safeFilename)
        .map(([path, source]) =>
          monaco.editor.createModel(source, languageFor(path), monaco.Uri.parse(`${labRoot}/${path}`))
        )
      model.current = monaco.editor.createModel(
        source.current,
        languageFor(safeFilename),
        monaco.Uri.parse(`${labRoot}/${safeFilename}`)
      )
      editor.current = monaco.editor.create(container.current, {
        ariaLabel: `${filename} TypeScript editor`,
        model: model.current,
        theme: 'hulla-signal',
        automaticLayout: true,
        cursorBlinking: 'smooth',
        experimentalGpuAcceleration: 'off',
        fontFamily: "'SFMono-Regular', 'Cascadia Code', 'Liberation Mono', monospace",
        fontLigatures: true,
        fontSize: 13,
        folding: false,
        glyphMargin: true,
        lineHeight: 22,
        lineNumbersMinChars: 2,
        minimap: { enabled: false },
        padding: { top: 18, bottom: 18 },
        quickSuggestions: { comments: false, other: true, strings: false },
        readOnly: inspectOnly,
        renderLineHighlight: 'none',
        roundedSelection: false,
        scrollBeyondLastLine: false,
        smoothScrolling: true,
        suggest: { preview: true, showInlineDetails: true },
        tabSize: 2,
        wordWrap: 'on',
      })
      editor.current.onDidChangeModelContent(() => {
        if (!applyingExternalChange.current && model.current) onChangeRef.current?.(model.current.getValue())
      })
      const scaleEditor = () => {
        const width = container.current?.clientWidth ?? 0
        const fontSize = width >= 760 ? 14 : 13

        editor.current?.updateOptions({
          fontSize,
          lineHeight: Math.round(fontSize * 1.65),
        })
      }
      resizeObserver = new ResizeObserver(scaleEditor)
      resizeObserver.observe(container.current)
      scaleEditor()
      decorations.current = editor.current.createDecorationsCollection()
      setReady(true)
    })

    return () => {
      cancelled = true
      resizeObserver?.disconnect()
      decorations.current?.clear()
      editor.current?.dispose()
      model.current?.dispose()
      supportModels.current.forEach((supportModel) => supportModel.dispose())
      editor.current = null
      model.current = null
      supportModels.current = []
    }
  }, [filename, id, inspectOnly, projectFiles])

  useEffect(() => {
    if (!model.current || model.current.getValue() === children) return
    applyingExternalChange.current = true
    model.current.setValue(children)
    applyingExternalChange.current = false
  }, [children])

  useEffect(() => {
    if (!ready || !editor.current || !model.current || !decorations.current) return

    const lineCount = model.current.getLineCount()
    const from = focus ? Math.max(1, Math.min(focus.from, lineCount)) : undefined
    const to = focus ? Math.max(from ?? 1, Math.min(focus.to, lineCount)) : undefined
    const removed = new Set(removedLines)
    const changed = new Set([...addedLines, ...removedLines])
    const nextDecorations: editor.IModelDeltaDecoration[] = focus
      ? []
      : [
          ...highlightLines
            .filter((line) => !changed.has(line))
            .map((line) => lineDecoration(lineRange(line), 'guided-line-highlight', 'guided-line-glyph')),
          ...addedLines
            .filter((line) => !removed.has(line))
            .map((line) => lineDecoration(lineRange(line), 'diff-line-added', 'diff-line-glyph-added')),
          ...removedLines.map((line) =>
            lineDecoration(lineRange(line), 'diff-line-removed', 'diff-line-glyph-removed')
          ),
        ]

    if (from && to) {
      for (let line = 1; line < from; line += 1) {
        nextDecorations.push(dimDecoration(line, model.current.getLineMaxColumn(line)))
      }
      for (let line = to + 1; line <= lineCount; line += 1) {
        nextDecorations.push(dimDecoration(line, model.current.getLineMaxColumn(line)))
      }
      nextDecorations.push(focusDecoration(from, to))
      editor.current.revealLinesInCenter(from, to, 1)
    }

    decorations.current.set(nextDecorations)
  }, [addedLines, focus, highlightLines, ready, removedLines])

  function reset() {
    editor.current?.setValue(children)
    editor.current?.setPosition({ column: 1, lineNumber: 1 })
  }

  return (
    <figure className={`code-card${focus ? ' code-card-focused' : ''}`}>
      <figcaption>
        <span className="editor-title" data-ready={ready}>
          <span className="editor-file-icon">{fileIcon(filename)}</span>
          <b>{filename}</b>
        </span>
        <span className="editor-tools">
          <span>{inspectOnly ? 'generated · hover types' : 'edit · hover types'}</span>
          {!inspectOnly && resettable ? (
            <button type="button" onClick={reset}>
              reset
            </button>
          ) : null}
        </span>
      </figcaption>
      {panel}
      <div className="monaco-host" ref={container} style={{ height }} />
      <div className="editor-foot">
        <span>TS</span>
        <span>Actual @hulla/api + project declarations loaded</span>
        <span>{ready ? 'Language service ready' : 'Starting language service…'}</span>
      </div>
    </figure>
  )
}

function lineRange(line: number): editor.IModelDeltaDecoration['range'] {
  return { startLineNumber: line, startColumn: 1, endLineNumber: line, endColumn: 1 }
}

function dimDecoration(line: number, endColumn: number): editor.IModelDeltaDecoration {
  return {
    range: { startLineNumber: line, startColumn: 1, endLineNumber: line, endColumn },
    options: { inlineClassName: 'guided-code-dim', isWholeLine: true },
  }
}

function focusDecoration(from: number, to: number): editor.IModelDeltaDecoration {
  return {
    range: { startLineNumber: from, startColumn: 1, endLineNumber: to, endColumn: Number.MAX_SAFE_INTEGER },
    options: {
      className: 'guided-code-focus',
      glyphMarginClassName: 'guided-code-focus-glyph',
      inlineClassName: 'guided-code-focus-inline',
      isWholeLine: true,
    },
  }
}

function lineDecoration(
  range: editor.IModelDeltaDecoration['range'],
  className: string,
  glyphMarginClassName: string
): editor.IModelDeltaDecoration {
  return {
    range,
    options: { className, glyphMarginClassName, isWholeLine: true },
  }
}

function languageFor(path: string) {
  return path.endsWith('.json') ? 'json' : 'typescript'
}

function fileIcon(path: string) {
  if (path.endsWith('.json')) return '{}'
  if (path.endsWith('.tsx')) return 'TX'
  return 'TS'
}
