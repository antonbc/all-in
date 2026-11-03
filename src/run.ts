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
  if (isCanceled(options.signal)) return failure(CANCELED_MESSAGE)
  switch (job.tool) {
    case "merge":
      return unavailable()
    case "split-pdf":
      return unavailable()
    case "rotate-pdf":
      return unavailable()
    case "images-to-pdf":
      return imagesToPdf(job.images, job.pageSize, "any", options)
    case "png-to-pdf":
      return imagesToPdf(job.images, job.pageSize, "png", options)
    case "jpeg-to-pdf":
      return unavailable()
    case "pdf-to-png":
      return unavailable()
    case "pdf-to-jpeg":
      return unavailable()
    case "pdf-to-word":
      return unavailable()
    case "word-to-pdf":
      return unavailable()
    case "background-remover":
      return unavailable()
    default: {
      const unreachable: never = job
      return failure(`This tool is not available: ${unreachable}`)
    }
  }
}

function unavailable(): Result {
  return failure("This tool is not available yet.")
}
