import { useId, useRef, useState, type DragEvent } from "react"
import {
  toolHasWork,
  toolInfo,
  type AddedFile,
  type ToolId,
  type ToolState,
} from "./catalog.ts"
import type { PageSize, Success } from "./domain.ts"
import { download } from "./download.ts"
import { formatSize } from "./format.ts"
import { takeFiles } from "./intake.ts"
import { Preview } from "./preview.tsx"
import { SplitPages } from "./split-pages.tsx"

export function ToolScreen({
  tool,
  state,
  onChange,
  onHome,
  onRun,
  onCancel,
}: {
  tool: ToolId
  state: ToolState
  onChange: (state: ToolState) => void
  onHome: () => void
  onRun: () => void
  onCancel: () => void
}) {
  const info = toolInfo(tool)
  const inputId = useId()
  const running = state.phase.kind === "running"
  const ready = canRun(tool, state)
  if (tool === "background-remover") {
    return (
      <main className="screen">
        <button type="button" className="text-button" onClick={onHome}>
          All tools
        </button>
        <h1>Background remover</h1>
        <p>Background remover is not in this slice yet.</p>
      </main>
    )
  }
  return (
    <main className="screen">
      <button type="button" className="text-button" onClick={onHome}>
        All tools
      </button>
      <h1>{info.name}</h1>
      <p className="lede">{info.detail}</p>
      <DropZone
        inputId={inputId}
        accept={info.accept}
        multiple={info.multiple}
        disabled={running}
        onFiles={(list) => {
          void addFiles(tool, state, list, onChange)
        }}
      />
      {state.messages.length > 0 && (
        <div role="alert" className="messages">
          {state.messages.map((message) => (
            <p key={message}>{message}</p>
          ))}
        </div>
      )}
      {state.files.length > 0 && (
        <ul className="files">
          {state.files.map((file, index) => (
            <li key={file.id}>
              <div>
                <strong>{file.name}</strong>
                <span>
                  {formatSize(file.size)}
                  {file.pageCount !== undefined ? ` · ${file.pageCount} ${file.pageCount === 1 ? "page" : "pages"}` : ""}
                </span>
              </div>
              <div className="file-actions">
                {info.multiple && (
                  <>
                    <button type="button" onClick={() => onChange(move(state, index, -1))} disabled={running || index === 0}>
                      Up
                    </button>
                    <button
                      type="button"
                      onClick={() => onChange(move(state, index, 1))}
                      disabled={running || index === state.files.length - 1}
                    >
                      Down
                    </button>
                  </>
                )}
                <button type="button" onClick={() => onChange(removeFile(state, file.id))} disabled={running}>
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {info.pageSize && (
        <fieldset disabled={running}>
          <legend>Page size</legend>
          {(["original", "a4", "letter"] as const).map((size) => (
            <label key={size}>
              <input
                type="radio"
                name={`${tool}-page`}
                checked={state.pageSize === size}
                onChange={() => onChange(resetResult({ ...state, pageSize: size }))}
              />
              {pageLabel(size)}
            </label>
          ))}
        </fieldset>
      )}
      {tool === "rotate" && (
        <fieldset disabled={running}>
          <legend>Turn</legend>
          {(
            [
              ["cw", "90° clockwise"],
              ["ccw", "90° counter-clockwise"],
              ["180", "180°"],
            ] as const
          ).map(([turn, label]) => (
            <label key={turn}>
              <input
                type="radio"
                name="turn"
                checked={state.turn === turn}
                onChange={() => onChange(resetResult({ ...state, turn }))}
              />
              {label}
            </label>
          ))}
        </fieldset>
      )}
      {tool === "split" && state.files[0] && (
        <section className="split">
          <h2>Pages</h2>
          <SplitPages
            key={state.files[0].id}
            bytes={state.files[0].bytes}
            selected={state.pages}
            onSelect={(page) => onChange(selectPage(state, page))}
          />
          <h2>Selected</h2>
          {state.pages.length === 0 ? (
            <p>Click pages in the order you want them.</p>
          ) : (
            <ol className="selected-pages">
              {state.pages.map((page, index) => (
                <li key={`${page}-${index}`}>
                  <span>Page {page}</span>
                  <button type="button" onClick={() => onChange(movePage(state, index, -1))} disabled={running || index === 0}>
                    Up
                  </button>
                  <button
                    type="button"
                    onClick={() => onChange(movePage(state, index, 1))}
                    disabled={running || index === state.pages.length - 1}
                  >
                    Down
                  </button>
                  <button type="button" onClick={() => onChange(removePage(state, index))} disabled={running}>
                    Remove
                  </button>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}
      <div className="action-row">
        {running ? (
          <button type="button" className="primary" onClick={onCancel}>
            Cancel
          </button>
        ) : (
          <button type="button" className="primary" disabled={!ready} onClick={onRun}>
            {info.verb}
          </button>
        )}
        {state.phase.kind !== "done" && (
          <ClearButton state={state} disabled={running ? false : !toolHasWork(state)} onClear={() => onChange(cleared())} onAbort={onCancel} />
        )}
      </div>
      {!ready && !running && <p className="hint">{hint(tool, state)}</p>}
      {state.phase.kind === "running" && (
        <div className="progress" role="status">
          <progress value={state.phase.completed} max={Math.max(state.phase.total, 1)} />
          <p>
            Working… {state.phase.completed} of {state.phase.total}
          </p>
        </div>
      )}
      {state.phase.kind === "failed" && (
        <p role="alert" className="messages">
          {state.phase.message}
        </p>
      )}
      {state.phase.kind === "done" && (
        <Finished result={state.phase.result} state={state} onClear={() => onChange(cleared())} onAbort={onCancel} />
      )}
    </main>
  )
}

function Finished({
  result,
  state,
  onClear,
  onAbort,
}: {
  result: Success
  state: ToolState
  onClear: () => void
  onAbort: () => void
}) {
  return (
    <section className="result">
      <h2>{result.filename}</h2>
      {result.notice && <p className="notice">{result.notice}</p>}
      <div className="action-row">
        <button type="button" className="primary" onClick={() => download(result.file, result.filename, result.mediaType)}>
          Download
        </button>
        <ClearButton state={state} disabled={false} onClear={onClear} onAbort={onAbort} />
      </div>
      <Preview result={result} />
    </section>
  )
}

function ClearButton({
  state,
  disabled,
  onClear,
  onAbort,
}: {
  state: ToolState
  disabled: boolean
  onClear: () => void
  onAbort: () => void
}) {
  const keep = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" disabled={disabled} onClick={() => setOpen(true)}>
        Clear
      </button>
      {open && (
        <div
          className="backdrop"
          role="presentation"
          onKeyDown={(event) => {
            if (event.key === "Escape") setOpen(false)
          }}
        >
          <div role="dialog" aria-modal="true" aria-labelledby="clear-title" className="dialog">
            <p id="clear-title">Clear this tool?</p>
            <div className="action-row">
              <button
                type="button"
                className="primary"
                onClick={() => {
                  if (state.phase.kind === "running") onAbort()
                  onClear()
                  setOpen(false)
                }}
              >
                Clear
              </button>
              <button type="button" ref={keep} autoFocus onClick={() => setOpen(false)}>
                Keep
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function DropZone({
  inputId,
  accept,
  multiple,
  disabled,
  onFiles,
}: {
  inputId: string
  accept: string
  multiple: boolean
  disabled: boolean
  onFiles: (files: File[]) => void
}) {
  function take(list: FileList | null) {
    if (!list || list.length === 0) return
    onFiles([...list])
  }
  return (
    <div
      className="drop"
      onDragOver={(event: DragEvent<HTMLDivElement>) => event.preventDefault()}
      onDrop={(event: DragEvent<HTMLDivElement>) => {
        event.preventDefault()
        if (!disabled) take(event.dataTransfer.files)
      }}
    >
      <p>Drop files here</p>
      <label className="browse" htmlFor={inputId}>
        Browse
      </label>
      <input
        id={inputId}
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        onChange={(event) => {
          take(event.currentTarget.files)
          event.currentTarget.value = ""
        }}
      />
    </div>
  )
}

async function addFiles(tool: ToolId, state: ToolState, list: File[], onChange: (state: ToolState) => void): Promise<void> {
  const taken = await takeFiles(tool, list)
  const info = toolInfo(tool)
  let accepted = taken.files
  const messages = taken.messages.slice()
  if (!info.multiple && accepted.length > 1) {
    accepted = accepted.slice(0, 1)
    messages.push("This tool uses one file.")
  }
  if (info.multiple && countsPages(tool)) {
    const room = 100 - state.files.length
    if (accepted.length > room) {
      accepted = accepted.slice(0, Math.max(room, 0))
      messages.push("This PDF would be over 100 pages.")
    }
  }
  if (accepted.length === 0) {
    onChange({ ...state, messages })
    return
  }
  const files = info.multiple ? [...state.files, ...accepted] : accepted
  onChange(resetResult({ ...state, files, messages, pages: info.multiple ? state.pages : [] }))
}

function countsPages(tool: ToolId): boolean {
  return tool === "images-to-pdf" || tool === "png-to-pdf" || tool === "jpeg-to-pdf"
}

function canRun(tool: ToolId, state: ToolState): boolean {
  if (state.phase.kind === "running") return false
  const count = state.files.length
  switch (tool) {
    case "merge":
      return count >= 2 && pageTotal(state.files) <= 100
    case "split":
      return count === 1 && state.pages.length > 0
    case "rotate":
      return count === 1 && state.turn !== null
    case "images-to-pdf":
    case "png-to-pdf":
    case "jpeg-to-pdf":
      return count > 0 && count <= 100
    case "pdf-to-word":
    case "pdf-to-png":
    case "pdf-to-jpeg":
    case "word-to-pdf":
      return count === 1
    case "background-remover":
      return false
    default: {
      const unreachable: never = tool
      void unreachable
      return false
    }
  }
}

function hint(tool: ToolId, state: ToolState): string {
  switch (tool) {
    case "merge":
      if (state.files.length < 2) return "Add at least two PDFs."
      return "This merge would be over 100 pages."
    case "split":
      if (state.files.length === 0) return "Add a PDF."
      return "Click at least one page."
    case "rotate":
      if (state.files.length === 0) return "Add a PDF."
      return "Choose how far to turn the pages."
    case "png-to-pdf":
      return "Add a PNG."
    case "jpeg-to-pdf":
      return "Add a JPEG."
    case "images-to-pdf":
      return "Add a PNG or JPEG."
    case "word-to-pdf":
      return "Add a .docx file."
    case "background-remover":
      return "Background removal is not available yet."
    default:
      return "Add a PDF."
  }
}

function pageTotal(files: AddedFile[]): number {
  return files.reduce((total, file) => total + (file.pageCount ?? 0), 0)
}

function pageLabel(size: PageSize): string {
  if (size === "original") return "Original"
  if (size === "a4") return "A4"
  return "Letter"
}

function resetResult(state: ToolState): ToolState {
  if (state.phase.kind === "running") return state
  return { ...state, phase: { kind: "ready" } }
}

function cleared(): ToolState {
  return {
    files: [],
    messages: [],
    pageSize: "original",
    turn: null,
    pages: [],
    phase: { kind: "ready" },
  }
}

function move(state: ToolState, index: number, direction: -1 | 1): ToolState {
  const target = index + direction
  if (target < 0 || target >= state.files.length) return state
  const files = state.files.slice()
  const current = files[index]
  const swap = files[target]
  if (!current || !swap) return state
  files[index] = swap
  files[target] = current
  return resetResult({ ...state, files })
}

function removeFile(state: ToolState, id: string): ToolState {
  return resetResult({ ...state, files: state.files.filter((file) => file.id !== id), pages: [] })
}

function selectPage(state: ToolState, page: number): ToolState {
  if (state.pages.includes(page)) return state
  return resetResult({ ...state, pages: [...state.pages, page] })
}

function movePage(state: ToolState, index: number, direction: -1 | 1): ToolState {
  const target = index + direction
  if (target < 0 || target >= state.pages.length) return state
  const pages = state.pages.slice()
  const current = pages[index]
  const swap = pages[target]
  if (current === undefined || swap === undefined) return state
  pages[index] = swap
  pages[target] = current
  return resetResult({ ...state, pages })
}

function removePage(state: ToolState, index: number): ToolState {
  return resetResult({ ...state, pages: state.pages.filter((_, pageIndex) => pageIndex !== index) }  )
}
