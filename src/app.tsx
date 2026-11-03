import { useEffect, useRef, useState } from "react"
import {
  emptyTool,
  isToolId,
  type ToolId,
  type ToolState,
} from "./catalog.ts"
import type { Job } from "./domain.ts"
import { Home } from "./home.tsx"
import { run } from "./run.ts"
import { ToolScreen } from "./tool-screen.tsx"

export function App() {
  const [jobs, setJobs] = useState<Record<ToolId, ToolState>>(initialJobs)
  const [active, setActive] = useState<ToolId | null>(null)
  const generation = useRef<Record<ToolId, number>>({
    "pdf-to-word": 0,
    "word-to-pdf": 0,
    "pdf-to-png": 0,
    "pdf-to-jpeg": 0,
    "png-to-pdf": 0,
    "jpeg-to-pdf": 0,
    merge: 0,
    split: 0,
    rotate: 0,
    "background-remover": 0,
    "images-to-pdf": 0,
  })
  const aborts = useRef(new Map<ToolId, AbortController>())

  useEffect(() => {
    const sync = () => setActive(readHash())
    sync()
    window.addEventListener("hashchange", sync)
    return () => window.removeEventListener("hashchange", sync)
  }, [])

  function open(tool: ToolId) {
    window.location.hash = `#/${tool}`
  }

  function home() {
    if (window.location.hash) window.location.hash = ""
    else setActive(null)
  }

  function change(tool: ToolId, state: ToolState) {
    setJobs((current) => ({ ...current, [tool]: state }))
  }

  function cancel(tool: ToolId) {
    aborts.current.get(tool)?.abort()
  }

  function start(tool: ToolId) {
    const state = jobs[tool]
    const job = buildJob(tool, state)
    if (!job) return
    const token = generation.current[tool] + 1
    generation.current[tool] = token
    const controller = new AbortController()
    aborts.current.set(tool, controller)
    setJobs((current) => ({
      ...current,
      [tool]: { ...current[tool], phase: { kind: "running", completed: 0, total: 1, pages: [] } },
    }))
    void run(job, {
      signal: controller.signal,
      onProgress: (progress) => {
        if (generation.current[tool] !== token) return
        setJobs((current) => {
          const existing = current[tool]
          if (existing.phase.kind !== "running") return current
          const mediaType = imageMedia(tool)
          const pages =
            progress.page && mediaType
              ? [...existing.phase.pages, { bytes: progress.page, mediaType }]
              : existing.phase.pages
          return {
            ...current,
            [tool]: {
              ...existing,
              phase: { kind: "running", completed: progress.completed, total: progress.total, pages },
            },
          }
        })
      },
    }).then((result) => {
      if (generation.current[tool] !== token) return
      setJobs((current) => {
        const existing = current[tool]
        if (existing.phase.kind !== "running") return current
        if (result.ok) return { ...current, [tool]: { ...existing, phase: { kind: "done", result } } }
        return { ...current, [tool]: { ...existing, phase: { kind: "failed", message: result.message } } }
      })
    })
  }

  function wipe(tool: ToolId) {
    generation.current[tool] += 1
    aborts.current.get(tool)?.abort()
    setJobs((current) => ({ ...current, [tool]: emptyTool() }))
  }

  const current = active ? jobs[active] : undefined
  if (!active || !current) return <Home onOpen={open} />
  return (
    <ToolScreen
      tool={active}
      state={current}
      onChange={(state) => {
        if (state.files.length === 0 && state.phase.kind === "ready" && state.messages.length === 0 && state.pages.length === 0) {
          wipe(active)
          return
        }
        change(active, state)
      }}
      onHome={home}
      onRun={() => start(active)}
      onCancel={() => cancel(active)}
    />
  )
}

function imageMedia(tool: ToolId): "image/png" | "image/jpeg" | undefined {
  if (tool === "pdf-to-png") return "image/png"
  if (tool === "pdf-to-jpeg") return "image/jpeg"
  return undefined
}

function readHash(): ToolId | null {
  const value = window.location.hash.replace(/^#\/?/, "")
  return isToolId(value) ? value : null
}

function initialJobs(): Record<ToolId, ToolState> {
  return {
    "pdf-to-word": emptyTool(),
    "word-to-pdf": emptyTool(),
    "pdf-to-png": emptyTool(),
    "pdf-to-jpeg": emptyTool(),
    "png-to-pdf": emptyTool(),
    "jpeg-to-pdf": emptyTool(),
    merge: emptyTool(),
    split: emptyTool(),
    rotate: emptyTool(),
    "background-remover": emptyTool(),
    "images-to-pdf": emptyTool(),
  }
}

function buildJob(tool: ToolId, state: ToolState): Job | undefined {
  const named = state.files.map((file) => ({ name: file.name, bytes: file.bytes }))
  const first = named[0]
  switch (tool) {
    case "merge":
      if (named.length < 2) return undefined
      return { tool: "merge", pdfs: named }
    case "split":
      if (!first || state.pages.length === 0) return undefined
      return { tool: "split-pdf", pdf: first, pages: state.pages }
    case "rotate":
      if (!first || !state.turn) return undefined
      return { tool: "rotate-pdf", pdf: first, turn: state.turn }
    case "images-to-pdf":
      if (named.length === 0) return undefined
      return { tool: "images-to-pdf", images: named, pageSize: state.pageSize }
    case "png-to-pdf":
      if (named.length === 0) return undefined
      return { tool: "png-to-pdf", images: named, pageSize: state.pageSize }
    case "jpeg-to-pdf":
      if (named.length === 0) return undefined
      return { tool: "jpeg-to-pdf", images: named, pageSize: state.pageSize }
    case "pdf-to-word":
      if (!first) return undefined
      return { tool: "pdf-to-word", pdf: first }
    case "pdf-to-png":
      if (!first) return undefined
      return { tool: "pdf-to-png", pdf: first }
    case "pdf-to-jpeg":
      if (!first) return undefined
      return { tool: "pdf-to-jpeg", pdf: first }
    case "word-to-pdf":
      if (!first) return undefined
      return { tool: "word-to-pdf", docx: first, pageSize: state.pageSize }
    case "background-remover":
      return undefined
    default: {
      const unreachable: never = tool
      return unreachable
    }
  }
}
