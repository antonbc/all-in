import { PDFDocument } from "pdf-lib"
import { failure, isMemoryError, MAX_BYTES, MAX_PAGES, type Failure, type NamedBytes } from "../domain.ts"

export async function loadPdf(
  file: NamedBytes,
): Promise<{ ok: true; document: PDFDocument } | Failure> {
  if (file.bytes.byteLength > MAX_BYTES) return failure(`${file.name} is over 200 MB.`)
  try {
    const document = await PDFDocument.load(file.bytes)
    if (document.getPageCount() > MAX_PAGES) {
      return failure(`${file.name} has more than 100 pages.`)
    }
    return { ok: true, document }
  } catch (error) {
    if (isPasswordError(error)) return failure(`${file.name} is password-protected.`)
    if (isMemoryError(error)) return failure("This tab ran out of memory. Clear a tool or use a smaller file.")
    return failure(`${file.name} could not be read as a PDF.`)
  }
}

function isPasswordError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("is encrypted")
}
