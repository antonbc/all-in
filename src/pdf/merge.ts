import { PDFDocument } from "pdf-lib"
import {
  CANCELED_MESSAGE,
  failure,
  isCanceled,
  MAX_PAGES,
  success,
  type NamedBytes,
  type Result,
  type RunOptions,
} from "../domain.ts"
import { sniff } from "../bytes.ts"
import { loadPdf } from "./load.ts"

export async function mergePdfs(pdfs: NamedBytes[], options: RunOptions): Promise<Result> {
  if (pdfs.length < 2) return failure("Merge needs at least two PDFs.")
  const stopped = stop(options, 0, pdfs.length)
  if (stopped) return stopped

  const opened = []
  let pages = 0
  for (let index = 0; index < pdfs.length; index += 1) {
    const file = pdfs[index]
    if (!file) return failure("Merge needs at least two PDFs.")
    const kind = sniff(file.bytes)
    if (kind !== "pdf") return failure(`${file.name} is not a PDF.`)
    const loaded = await loadPdf(file)
    if (!loaded.ok) return loaded
    pages += loaded.document.getPageCount()
    if (pages > MAX_PAGES) return failure("This merge would be over 100 pages.")
    opened.push(loaded.document)
    const reported = stop(options, index + 1, pdfs.length)
    if (reported) return reported
  }

  const merged = await PDFDocument.create()
  for (const document of opened) {
    if (isCanceled(options.signal)) return failure(CANCELED_MESSAGE)
    const copied = await merged.copyPages(document, document.getPageIndices())
    for (const page of copied) merged.addPage(page)
  }
  if (isCanceled(options.signal)) return failure(CANCELED_MESSAGE)
  const file = await merged.save()
  return success(file, "application/pdf", "merged.pdf")
}

function stop(options: RunOptions, completed: number, total: number): Result | undefined {
  options.onProgress?.({ completed, total })
  if (isCanceled(options.signal)) return failure(CANCELED_MESSAGE)
  return undefined
}
