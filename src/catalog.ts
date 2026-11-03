import type { PageSize, Success, Turn } from "./domain.ts"

export const TOOL_IDS = [
  "pdf-to-word",
  "word-to-pdf",
  "pdf-to-png",
  "pdf-to-jpeg",
  "png-to-pdf",
  "jpeg-to-pdf",
  "merge",
  "split",
  "rotate",
  "background-remover",
  "images-to-pdf",
] as const

export type ToolId = (typeof TOOL_IDS)[number]

export type ToolInfo = {
  id: ToolId
  name: string
  group: "Convert" | "Organize" | "Image"
  verb: string
  detail: string
  accept: string
  multiple: boolean
  pageSize: boolean
}

export const TOOLS: readonly ToolInfo[] = [
  {
    id: "pdf-to-word",
    name: "PDF to Word",
    group: "Convert",
    verb: "Convert to Word",
    detail: "Selectable text stays text. Pictures on those pages stay in reading order.",
    accept: ".pdf,application/pdf",
    multiple: false,
    pageSize: false,
  },
  {
    id: "word-to-pdf",
    name: "Word to PDF",
    group: "Convert",
    verb: "Convert to PDF",
    detail: "Paragraphs, pictures, and header and footer text. A .docx file.",
    accept: ".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    multiple: false,
    pageSize: true,
  },
  {
    id: "pdf-to-png",
    name: "PDF to PNG",
    group: "Convert",
    verb: "Convert to PNG",
    detail: "Each page becomes a PNG at twice the page size.",
    accept: ".pdf,application/pdf",
    multiple: false,
    pageSize: false,
  },
  {
    id: "pdf-to-jpeg",
    name: "PDF to JPEG",
    group: "Convert",
    verb: "Convert to JPEG",
    detail: "Each page becomes a JPEG at twice the page size.",
    accept: ".pdf,application/pdf",
    multiple: false,
    pageSize: false,
  },
  {
    id: "png-to-pdf",
    name: "PNG to PDF",
    group: "Convert",
    verb: "Convert to PDF",
    detail: "One PNG on each page, in the order you set.",
    accept: ".png,image/png",
    multiple: true,
    pageSize: true,
  },
  {
    id: "jpeg-to-pdf",
    name: "JPEG to PDF",
    group: "Convert",
    verb: "Convert to PDF",
    detail: "One JPEG on each page, in the order you set.",
    accept: ".jpg,.jpeg,image/jpeg",
    multiple: true,
    pageSize: true,
  },
  {
    id: "merge",
    name: "Merge",
    group: "Organize",
    verb: "Merge",
    detail: "Each PDF's pages stay intact, in the list order.",
    accept: ".pdf,application/pdf",
    multiple: true,
    pageSize: false,
  },
  {
    id: "split",
    name: "Split",
    group: "Organize",
    verb: "Split",
    detail: "Click the pages you want, in the order you want them.",
    accept: ".pdf,application/pdf",
    multiple: false,
    pageSize: false,
  },
  {
    id: "rotate",
    name: "Rotate",
    group: "Organize",
    verb: "Rotate",
    detail: "Every page turns the same way.",
    accept: ".pdf,application/pdf",
    multiple: false,
    pageSize: false,
  },
  {
    id: "background-remover",
    name: "Background remover",
    group: "Image",
    verb: "Remove background",
    detail: "Not in this slice yet.",
    accept: "",
    multiple: false,
    pageSize: false,
  },
  {
    id: "images-to-pdf",
    name: "Images to PDF",
    group: "Image",
    verb: "Convert to PDF",
    detail: "A mix of PNG and JPEG, one image per page.",
    accept: ".png,.jpg,.jpeg,image/png,image/jpeg",
    multiple: true,
    pageSize: true,
  },
]

export const GROUPS = ["Convert", "Organize", "Image"] as const

export function toolInfo(id: ToolId): ToolInfo {
  const info = TOOLS.find((tool) => tool.id === id)
  if (!info) throw new Error("Unknown tool")
  return info
}

export function isToolId(value: string): value is ToolId {
  switch (value) {
    case "pdf-to-word":
    case "word-to-pdf":
    case "pdf-to-png":
    case "pdf-to-jpeg":
    case "png-to-pdf":
    case "jpeg-to-pdf":
    case "merge":
    case "split":
    case "rotate":
    case "background-remover":
    case "images-to-pdf":
      return true
    default:
      return false
  }
}

export type AddedFile = {
  id: string
  name: string
  size: number
  bytes: Uint8Array
  pageCount?: number
}

export type RunningPage = {
  bytes: Uint8Array
  mediaType: string
}

export type Phase =
  | { kind: "ready" }
  | { kind: "running"; completed: number; total: number; pages: RunningPage[] }
  | { kind: "done"; result: Success }
  | { kind: "failed"; message: string }

export type ToolState = {
  files: AddedFile[]
  messages: string[]
  pageSize: PageSize
  turn: Turn | null
  pages: number[]
  phase: Phase
}

export function emptyTool(): ToolState {
  return {
    files: [],
    messages: [],
    pageSize: "original",
    turn: null,
    pages: [],
    phase: { kind: "ready" },
  }
}

export function toolHasWork(state: ToolState): boolean {
  return state.files.length > 0 || state.pages.length > 0 || state.messages.length > 0 || state.phase.kind !== "ready"
}
