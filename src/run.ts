import {
  CANCELED_MESSAGE,
  failure,
  isCanceled,
  isMemoryError,
  MEMORY_MESSAGE,
  type Job,
  type Result,
  type RunOptions,
} from "./domain.ts"
import { imagesToPdf } from "./pdf/images.ts"
import { mergePdfs } from "./pdf/merge.ts"
import { pdfToImages } from "./pdf/raster.ts"
import { rotatePdf } from "./pdf/rotate.ts"
import { splitPdf } from "./pdf/split.ts"
import { pdfToWord } from "./pdf/to-word.ts"
import { wordToPdf } from "./word/to-pdf.ts"

export async function run(job: Job, options: RunOptions = {}): Promise<Result> {
  try {
    if (isCanceled(options.signal)) return failure(CANCELED_MESSAGE)
    const result = await dispatch(job, options)
    if (isCanceled(options.signal)) return failure(CANCELED_MESSAGE)
    return result
  } catch (error) {
    if (isCanceled(options.signal)) return failure(CANCELED_MESSAGE)
    if (isMemoryError(error)) return failure(MEMORY_MESSAGE)
    return failure("This file could not be read.")
  }
}

async function dispatch(job: Job, options: RunOptions): Promise<Result> {
  switch (job.tool) {
    case "merge":
      return mergePdfs(job.pdfs, options)
    case "split-pdf":
      return splitPdf(job.pdf, job.pages, options)
    case "rotate-pdf":
      return rotatePdf(job.pdf, job.turn, options)
    case "images-to-pdf":
      return imagesToPdf(job.images, job.pageSize, "any", options)
    case "png-to-pdf":
      return imagesToPdf(job.images, job.pageSize, "png", options)
    case "jpeg-to-pdf":
      return imagesToPdf(job.images, job.pageSize, "jpeg", options)
    case "pdf-to-png":
      return pdfToImages(job.pdf, "png", options)
    case "pdf-to-jpeg":
      return pdfToImages(job.pdf, "jpeg", options)
    case "pdf-to-word":
      return pdfToWord(job.pdf, options)
    case "word-to-pdf":
      return wordToPdf(job.docx, job.pageSize, options)
    case "background-remover":
      return failure("Background remover is not in this slice yet.")
    default: {
      const unreachable: never = job
      return failure(`This tool is not available: ${unreachable}`)
    }
  }
}
