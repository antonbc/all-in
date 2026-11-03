import { imageSize, sniff } from "./bytes.ts"
import type { ToolId } from "./catalog.ts"
import { type AddedFile } from "./catalog.ts"
import { isMemoryError, MAX_BYTES, MEMORY_MESSAGE } from "./domain.ts"
import { loadPdf } from "./pdf/load.ts"
import { readDocx } from "./word/read.ts"

export async function takeFiles(tool: ToolId, list: File[]): Promise<{ files: AddedFile[]; messages: string[] }> {
  const files: AddedFile[] = []
  const messages: string[] = []
  for (const file of list) {
    const taken = await takeFile(tool, file)
    if (taken.ok) files.push(taken.file)
    else messages.push(taken.message)
  }
  return { files, messages }
}

async function takeFile(tool: ToolId, file: File): Promise<{ ok: true; file: AddedFile } | { ok: false; message: string }> {
  if (file.size > MAX_BYTES) return { ok: false, message: `${file.name} is over 200 MB.` }
  let bytes: Uint8Array
  try {
    bytes = new Uint8Array(await file.arrayBuffer())
  } catch (error) {
    if (isMemoryError(error)) return { ok: false, message: MEMORY_MESSAGE }
    return { ok: false, message: `${file.name} could not be read.` }
  }
  if (bytes.byteLength > MAX_BYTES) return { ok: false, message: `${file.name} is over 200 MB.` }
  const kind = sniff(bytes)
  if (kind === "webp") return { ok: false, message: `${file.name} is a WebP file. Use PNG or JPEG.` }
  if (expectsPdf(tool)) return takePdf(file.name, bytes)
  if (tool === "word-to-pdf") return takeDocx(file.name, bytes)
  return takeImage(tool, file.name, bytes, kind)
}

function expectsPdf(tool: ToolId): boolean {
  return tool === "merge" || tool === "split" || tool === "rotate" || tool === "pdf-to-word" || tool === "pdf-to-png" || tool === "pdf-to-jpeg"
}

async function takePdf(name: string, bytes: Uint8Array): Promise<{ ok: true; file: AddedFile } | { ok: false; message: string }> {
  if (sniff(bytes) !== "pdf") return { ok: false, message: `${name} is not a PDF.` }
  const loaded = await loadPdf({ name, bytes })
  if (!loaded.ok) return loaded
  return { ok: true, file: added(name, bytes, loaded.document.getPageCount()) }
}

function takeDocx(name: string, bytes: Uint8Array): { ok: true; file: AddedFile } | { ok: false; message: string } {
  const read = readDocx(bytes, name)
  if (!read.ok) return read
  return { ok: true, file: added(name, bytes) }
}

function takeImage(
  tool: ToolId,
  name: string,
  bytes: Uint8Array,
  kind: ReturnType<typeof sniff>,
): { ok: true; file: AddedFile } | { ok: false; message: string } {
  if (tool === "png-to-pdf" && kind !== "png") return { ok: false, message: `${name} is not a PNG.` }
  if (tool === "jpeg-to-pdf" && kind !== "jpeg") return { ok: false, message: `${name} is not a JPEG.` }
  if (kind !== "png" && kind !== "jpeg") return { ok: false, message: `${name} is not a PNG or JPEG.` }
  if (!imageSize(bytes)) return { ok: false, message: `${name} could not be read as an image.` }
  return { ok: true, file: added(name, bytes) }
}

function added(name: string, bytes: Uint8Array, pageCount?: number): AddedFile {
  return { id: crypto.randomUUID(), name, size: bytes.byteLength, bytes, pageCount }
}
