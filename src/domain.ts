export type NamedBytes = {
  name: string
  bytes: Uint8Array
}

export type PageSize = "original" | "a4" | "letter"

export type Turn = "cw" | "ccw" | "180"

export type Job =
  | { tool: "background-remover"; image: NamedBytes }
  | { tool: "merge"; pdfs: NamedBytes[] }
  | { tool: "images-to-pdf"; images: NamedBytes[]; pageSize: PageSize }
  | { tool: "png-to-pdf"; images: NamedBytes[]; pageSize: PageSize }
  | { tool: "jpeg-to-pdf"; images: NamedBytes[]; pageSize: PageSize }
  | { tool: "pdf-to-word"; pdf: NamedBytes }
  | { tool: "word-to-pdf"; docx: NamedBytes; pageSize: PageSize }
  | { tool: "pdf-to-png"; pdf: NamedBytes }
  | { tool: "pdf-to-jpeg"; pdf: NamedBytes }
  | { tool: "split-pdf"; pdf: NamedBytes; pages: number[] }
  | { tool: "rotate-pdf"; pdf: NamedBytes; turn: Turn }

export type Success = {
  ok: true
  file: Uint8Array
  mediaType: string
  filename: string
  notice?: string
}

export type Failure = {
  ok: false
  message: string
}

export type Result = Success | Failure

export type Progress = {
  completed: number
  total: number
}

export type RunOptions = {
  signal?: AbortSignal
  onProgress?: (progress: Progress) => void
}

export const MEMORY_MESSAGE =
  "This tab ran out of memory. Clear a tool or use a smaller file."

export const CANCELED_MESSAGE = "Canceled."

export const MAX_BYTES = 200 * 1024 * 1024

export const MAX_PAGES = 100

export const JPEG_QUALITY = 0.92

export const EXPORT_SCALE = 2

export const A4 = { width: 595.28, height: 841.89 }

export const LETTER = { width: 612, height: 792 }

export function failure(message: string): Failure {
  return { ok: false, message }
}

export function success(
  file: Uint8Array,
  mediaType: string,
  filename: string,
  notice?: string,
): Success {
  if (notice === undefined) return { ok: true, file, mediaType, filename }
  return { ok: true, file, mediaType, filename, notice }
}

export function isMemoryError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  if (error instanceof RangeError) return true
  return /out of memory|allocation failed|array buffer allocation|invalid array length/i.test(
    error.message,
  )
}

export function isCanceled(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true
}
