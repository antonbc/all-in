import { PDFDocument } from "pdf-lib"
import { imageSize, sniff } from "../bytes.ts"
import {
  A4,
  CANCELED_MESSAGE,
  failure,
  isCanceled,
  LETTER,
  MAX_BYTES,
  MAX_PAGES,
  success,
  type Failure,
  type NamedBytes,
  type PageSize,
  type Result,
  type RunOptions,
} from "../domain.ts"

export async function imagesToPdf(
  images: NamedBytes[],
  pageSize: PageSize,
  accept: "any" | "png" | "jpeg",
  options: RunOptions,
): Promise<Result> {
  if (images.length === 0) return failure("Add a PNG or JPEG.")
  if (images.length > MAX_PAGES) return failure("This PDF would be over 100 pages.")
  options.onProgress?.({ completed: 0, total: images.length })
  if (isCanceled(options.signal)) return failure(CANCELED_MESSAGE)

  const pdf = await PDFDocument.create()
  for (let index = 0; index < images.length; index += 1) {
    const image = images[index]
    if (!image) return failure("Add a PNG or JPEG.")
    const refused = await placeImage(pdf, image, pageSize, accept)
    if (refused) return refused
    options.onProgress?.({ completed: index + 1, total: images.length })
    if (isCanceled(options.signal)) return failure(CANCELED_MESSAGE)
  }
  return success(await pdf.save(), "application/pdf", "images.pdf")
}

async function placeImage(
  pdf: PDFDocument,
  image: NamedBytes,
  pageSize: PageSize,
  accept: "any" | "png" | "jpeg",
): Promise<Failure | undefined> {
  if (image.bytes.byteLength > MAX_BYTES) return failure(`${image.name} is over 200 MB.`)
  const kind = sniff(image.bytes)
  if (kind === "webp") return failure(`${image.name} is a WebP file. Use PNG or JPEG.`)
  if (accept === "png" && kind !== "png") return failure(`${image.name} is not a PNG.`)
  if (accept === "jpeg" && kind !== "jpeg") return failure(`${image.name} is not a JPEG.`)
  if (kind !== "png" && kind !== "jpeg") return failure(`${image.name} is not a PNG or JPEG.`)
  const size = imageSize(image.bytes)
  if (!size) return failure(`${image.name} could not be read as an image.`)
  const embedded = kind === "png" ? await pdf.embedPng(image.bytes) : await pdf.embedJpg(image.bytes)
  const pageSizePt = paper(pageSize, size)
  const page = pdf.addPage([pageSizePt.width, pageSizePt.height])
  const fitted = fit(pageSizePt, { width: embedded.width, height: embedded.height })
  page.drawImage(embedded, fitted)
  return undefined
}

function paper(pageSize: PageSize, image: { width: number; height: number }): { width: number; height: number } {
  if (pageSize === "original") return { width: image.width, height: image.height }
  const base = pageSize === "a4" ? A4 : LETTER
  if (image.width > image.height) return { width: base.height, height: base.width }
  return { width: base.width, height: base.height }
}

function fit(
  page: { width: number; height: number },
  image: { width: number; height: number },
): { x: number; y: number; width: number; height: number } {
  const scale = Math.min(page.width / image.width, page.height / image.height)
  const width = image.width * scale
  const height = image.height * scale
  return {
    x: (page.width - width) / 2,
    y: (page.height - height) / 2,
    width,
    height,
  }
}
