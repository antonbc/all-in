import { zipSync } from "fflate"
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs"
import { sniff } from "../bytes.ts"
import {
  CANCELED_MESSAGE,
  EXPORT_SCALE,
  failure,
  isCanceled,
  JPEG_QUALITY,
  success,
  type NamedBytes,
  type Result,
  type RunOptions,
} from "../domain.ts"
import { isRecord } from "../record.ts"
import { loadPdf } from "./load.ts"
import { isPaintContext, openPdfJs } from "./pdfjs.ts"

type Format = "png" | "jpeg"

export async function pdfToImages(file: NamedBytes, format: Format, options: RunOptions): Promise<Result> {
  if (sniff(file.bytes) !== "pdf") return failure(`${file.name} is not a PDF.`)
  const loaded = await loadPdf(file)
  if (!loaded.ok) return loaded
  const total = loaded.document.getPageCount()
  options.onProgress?.({ completed: 0, total })
  if (isCanceled(options.signal)) return failure(CANCELED_MESSAGE)

  const pdf = await openPdfJs(file.bytes)
  try {
    const images: Uint8Array[] = []
    for (let pageNumber = 1; pageNumber <= total; pageNumber += 1) {
      if (isCanceled(options.signal)) return failure(CANCELED_MESSAGE)
      const page = await pdf.getPage(pageNumber)
      images.push(await renderPage(page, format))
      options.onProgress?.({ completed: pageNumber, total })
      if (isCanceled(options.signal)) return failure(CANCELED_MESSAGE)
    }
    if (images.length === 1) {
      const only = images[0]
      if (!only) return failure(`${file.name} could not be read as a PDF.`)
      return success(only, format === "png" ? "image/png" : "image/jpeg", format === "png" ? "page.png" : "page.jpg")
    }
    const entries: Record<string, Uint8Array> = {}
    images.forEach((image, index) => {
      entries[`page-${index + 1}.${format === "png" ? "png" : "jpg"}`] = image
    })
    return success(zipSync(entries), "application/zip", "pages.zip")
  } finally {
    await pdf.destroy()
  }
}

async function renderPage(page: pdfjs.PDFPageProxy, format: Format): Promise<Uint8Array> {
  const viewport = page.getViewport({ scale: EXPORT_SCALE })
  const width = Math.max(1, Math.round(viewport.width))
  const height = Math.max(1, Math.round(viewport.height))
  const surface = await createSurface(width, height)
  const context = surface.context()
  if (!isPaintContext(context)) throw new Error("Could not draw this page.")
  await page.render({ canvas: renderCanvas(surface.canvas), canvasContext: context, viewport }).promise
  return format === "png" ? surface.png() : surface.jpeg()
}

type Drawable = {
  width: number
  height: number
  getContext: (kind: "2d") => unknown
}

type Surface = {
  canvas: Drawable
  context: () => unknown
  png: () => Promise<Uint8Array> | Uint8Array
  jpeg: () => Promise<Uint8Array> | Uint8Array
}

async function createSurface(width: number, height: number): Promise<Surface> {
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height
    return {
      canvas,
      context: () => canvas.getContext("2d"),
      png: () => canvasBytes(canvas, "image/png"),
      jpeg: () => canvasBytes(canvas, "image/jpeg", JPEG_QUALITY),
    }
  }
  const canvas = await nodeCanvas(width, height)
  return {
    canvas,
    context: () => canvas.getContext("2d"),
    png: () => copyBytes(canvas.toBuffer("image/png")),
    jpeg: () => copyBytes(canvas.toBuffer("image/jpeg", Math.round(JPEG_QUALITY * 100))),
  }
}

function renderCanvas(canvas: Drawable): HTMLCanvasElement {
  if (typeof HTMLCanvasElement !== "undefined" && canvas instanceof HTMLCanvasElement) return canvas
  if (canvas.width < 1 || canvas.height < 1) throw new Error("Could not draw this page.")
  return canvas as HTMLCanvasElement
}

type NodeCanvas = {
  width: number
  height: number
  getContext: (kind: "2d") => unknown
  toBuffer: {
    (mime: "image/png"): Uint8Array
    (mime: "image/jpeg", quality?: number): Uint8Array
  }
}

async function nodeCanvas(width: number, height: number): Promise<NodeCanvas> {
  const specifier = "@napi-rs/canvas"
  const loaded: unknown = await import(/* @vite-ignore */ specifier)
  if (!isRecord(loaded) || typeof loaded.createCanvas !== "function") {
    throw new Error("Could not draw this page.")
  }
  const created: unknown = loaded.createCanvas(width, height)
  if (!isNodeCanvas(created)) throw new Error("Could not draw this page.")
  return created
}

function isNodeCanvas(value: unknown): value is NodeCanvas {
  return (
    isRecord(value) &&
    typeof value.width === "number" &&
    typeof value.height === "number" &&
    typeof value.getContext === "function" &&
    typeof value.toBuffer === "function"
  )
}

function canvasBytes(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Could not encode this page."))
        return
      }
      void blob.arrayBuffer().then((buffer) => resolve(new Uint8Array(buffer)))
    }, type, quality)
  })
}

function copyBytes(bytes: Uint8Array): Uint8Array {
  return new Uint8Array(bytes)
}
