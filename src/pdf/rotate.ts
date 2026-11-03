import { degrees } from "pdf-lib"
import { CANCELED_MESSAGE, failure, isCanceled, success, type NamedBytes, type Result, type RunOptions, type Turn } from "../domain.ts"
import { sniff } from "../bytes.ts"
import { loadPdf } from "./load.ts"

export async function rotatePdf(file: NamedBytes, turn: Turn, options: RunOptions): Promise<Result> {
  if (sniff(file.bytes) !== "pdf") return failure(`${file.name} is not a PDF.`)
  const loaded = await loadPdf(file)
  if (!loaded.ok) return loaded
  const pages = loaded.document.getPages()
  const delta = turn === "cw" ? 90 : turn === "ccw" ? 270 : 180
  options.onProgress?.({ completed: 0, total: pages.length })
  if (isCanceled(options.signal)) return failure(CANCELED_MESSAGE)
  pages.forEach((page, index) => {
    const next = (page.getRotation().angle + delta) % 360
    page.setRotation(degrees(next))
    options.onProgress?.({ completed: index + 1, total: pages.length })
  })
  if (isCanceled(options.signal)) return failure(CANCELED_MESSAGE)
  return success(await loaded.document.save(), "application/pdf", "rotated.pdf")
}
