import { PDFDocument } from "pdf-lib"
import { CANCELED_MESSAGE, failure, isCanceled, success, type NamedBytes, type Result, type RunOptions } from "../domain.ts"
import { sniff } from "../bytes.ts"
import { loadPdf } from "./load.ts"

export async function splitPdf(file: NamedBytes, pages: number[], options: RunOptions): Promise<Result> {
  if (sniff(file.bytes) !== "pdf") return failure(`${file.name} is not a PDF.`)
  if (pages.length === 0) return failure("Split needs at least one page.")
  const loaded = await loadPdf(file)
  if (!loaded.ok) return loaded
  const count = loaded.document.getPageCount()
  const indexes: number[] = []
  for (const page of pages) {
    if (!Number.isInteger(page) || page < 1 || page > count) {
      return failure(`${file.name} does not have page ${page}.`)
    }
    indexes.push(page - 1)
  }

  options.onProgress?.({ completed: 0, total: indexes.length })
  if (isCanceled(options.signal)) return failure(CANCELED_MESSAGE)

  const split = await PDFDocument.create()
  const copied = await split.copyPages(loaded.document, indexes)
  if (isCanceled(options.signal)) return failure(CANCELED_MESSAGE)
  for (const page of copied) split.addPage(page)
  options.onProgress?.({ completed: indexes.length, total: indexes.length })
  if (isCanceled(options.signal)) return failure(CANCELED_MESSAGE)
  return success(await split.save(), "application/pdf", "split.pdf")
}
