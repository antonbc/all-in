import { Document, ImageRun, Packer, PageBreak, Paragraph, TextRun } from "docx"
import { OPS, type PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs"
import { encodePng, jpegSize, rgbaFromPixels, sniff } from "../bytes.ts"
import {
  CANCELED_MESSAGE,
  failure,
  isCanceled,
  success,
  type NamedBytes,
  type Result,
  type RunOptions,
} from "../domain.ts"
import { isRecord } from "../record.ts"
import { loadPdf } from "./load.ts"
import { openPdfJs } from "./pdfjs.ts"

type PdfPage = Awaited<ReturnType<PDFDocumentProxy["getPage"]>>
type Matrix = [number, number, number, number, number, number]

type Picture = {
  top: number
  bytes: Uint8Array
  type: "png" | "jpg"
  width: number
  height: number
}

type Line = {
  top: number
  text: string
}

type Block = { kind: "text"; text: string } | (Picture & { kind: "image" })

export async function pdfToWord(file: NamedBytes, options: RunOptions): Promise<Result> {
  if (sniff(file.bytes) !== "pdf") return failure(`${file.name} is not a PDF.`)
  const loaded = await loadPdf(file)
  if (!loaded.ok) return loaded
  const total = loaded.document.getPageCount()
  options.onProgress?.({ completed: 0, total })
  if (isCanceled(options.signal)) return failure(CANCELED_MESSAGE)

  const pdf = await openPdfJs(file.bytes)
  try {
    const children: Paragraph[] = []
    const blankPages: number[] = []
    for (let pageNumber = 1; pageNumber <= total; pageNumber += 1) {
      if (isCanceled(options.signal)) return failure(CANCELED_MESSAGE)
      const page = await pdf.getPage(pageNumber)
      const built = await pageContent(page)
      if (built.length === 0) {
        blankPages.push(pageNumber)
        children.push(new Paragraph({}))
      }
      for (const block of built) children.push(paragraphFor(block))
      if (pageNumber < total) children.push(new Paragraph({ children: [new PageBreak()] }))
      options.onProgress?.({ completed: pageNumber, total })
    }
    if (isCanceled(options.signal)) return failure(CANCELED_MESSAGE)
    const document = new Document({ sections: [{ children }] })
    const packed = await Packer.toBuffer(document)
    const notice = blankPages.map((page) => `Page ${page} has no selectable text and was not read.`).join(" ")
    return success(
      new Uint8Array(packed),
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "document.docx",
      notice === "" ? undefined : notice,
    )
  } finally {
    await pdf.destroy()
  }
}

function paragraphFor(block: Block): Paragraph {
  if (block.kind === "text") return new Paragraph({ children: [new TextRun(block.text)] })
  const size = fittedPixels(block.width, block.height)
  return new Paragraph({
    children: [
      new ImageRun({
        type: block.type,
        data: block.bytes,
        transformation: size,
      }),
    ],
  })
}

function fittedPixels(width: number, height: number): { width: number; height: number } {
  const scale = Math.min(1, 540 / width, 720 / height)
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

async function pageContent(page: PdfPage): Promise<Block[]> {
  const content = await page.getTextContent()
  const lines = textLines(content.items).filter((line) => line.text.trim() !== "")
  if (lines.length === 0) return []
  const pictures = await picturesOnPage(page)
  const blocks: Array<{ kind: "text"; text: string; top: number } | (Picture & { kind: "image" })> = [
    ...lines.map((line) => ({ kind: "text" as const, text: line.text.trim(), top: line.top })),
    ...pictures.map((picture) => ({ ...picture, kind: "image" as const })),
  ]
  blocks.sort((left, right) => right.top - left.top)
  return blocks.map((block) => (block.kind === "text" ? { kind: "text", text: block.text } : block))
}

function textLines(items: unknown[]): Line[] {
  const pieces: Array<{ top: number; x: number; text: string }> = []
  for (const item of items) {
    if (!isRecord(item) || typeof item.str !== "string" || !Array.isArray(item.transform)) continue
    if (item.str.trim() === "") continue
    const x = numberAt(item.transform, 4)
    const baseline = numberAt(item.transform, 5)
    const height = typeof item.height === "number" ? item.height : 0
    pieces.push({ top: baseline + height, x, text: item.str })
  }
  pieces.sort((left, right) => right.top - left.top || left.x - right.x)
  const lines: Array<Line & { end: number }> = []
  for (const piece of pieces) {
    const line = lines.find((candidate) => Math.abs(candidate.top - piece.top) < 2)
    if (!line) {
      lines.push({ top: piece.top, end: piece.x, text: piece.text })
      continue
    }
    const needsSpace = piece.x - line.end > 1 && !piece.text.startsWith(" ") && !line.text.endsWith(" ")
    line.text += needsSpace ? ` ${piece.text}` : piece.text
    line.end = piece.x
  }
  return lines.map((line) => ({ top: line.top, text: line.text }))
}

async function picturesOnPage(page: PdfPage): Promise<Picture[]> {
  const operators = await page.getOperatorList()
  let current: Matrix = [1, 0, 0, 1, 0, 0]
  const stack: Matrix[] = []
  const pictures: Picture[] = []
  for (let index = 0; index < operators.fnArray.length; index += 1) {
    const fn = operators.fnArray[index]
    const args = operators.argsArray[index]
    if (fn === OPS.save) {
      stack.push(current)
      continue
    }
    if (fn === OPS.restore) {
      current = stack.pop() ?? [1, 0, 0, 1, 0, 0]
      continue
    }
    const matrix = fn === OPS.transform ? readMatrix(args) : undefined
    if (matrix) {
      current = multiply(current, matrix)
      continue
    }
    if (fn !== OPS.paintImageXObject) continue
    const name = Array.isArray(args) ? args[0] : undefined
    if (typeof name !== "string") continue
    const picture = pictureFrom(await requestObject(page.objs, name), current)
    if (picture) pictures.push(picture)
  }
  return pictures
}

function pictureFrom(value: unknown, matrix: Matrix): Picture | undefined {
  if (!isRecord(value) || typeof value.width !== "number" || typeof value.height !== "number") return undefined
  const data = pixelBytes(value.data)
  if (!data) return undefined
  const top = Math.max(...corners(matrix).map((point) => point[1]))
  if (data.length >= 2 && data[0] === 0xff && data[1] === 0xd8) {
    const size = jpegSize(data) ?? { width: value.width, height: value.height }
    return { top, bytes: data, type: "jpg", width: size.width, height: size.height }
  }
  const channels = channelKind(value.width, value.height, data)
  if (!channels) return undefined
  const rgba = rgbaFromPixels(value.width, value.height, data, channels)
  if (!rgba) return undefined
  return {
    top,
    bytes: encodePng(value.width, value.height, rgba),
    type: "png",
    width: value.width,
    height: value.height,
  }
}

function channelKind(width: number, height: number, data: Uint8Array): "rgb" | "rgba" | "gray" | undefined {
  const pixels = width * height
  if (data.length >= pixels * 4) return "rgba"
  if (data.length >= pixels * 3) return "rgb"
  if (data.length >= pixels) return "gray"
  return undefined
}

function pixelBytes(value: unknown): Uint8Array | undefined {
  if (value instanceof Uint8Array) return value
  if (value instanceof Uint8ClampedArray) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
  }
  return undefined
}

function requestObject(source: unknown, name: string): Promise<unknown> {
  if (!isRecord(source) || typeof source.get !== "function") return Promise.resolve(undefined)
  const get = source.get
  return new Promise((resolve) => {
    get.call(source, name, (loaded: unknown) => {
      resolve(loaded)
    })
  })
}

function readMatrix(value: unknown): Matrix | undefined {
  if (!Array.isArray(value) || value.length < 6) return undefined
  const numbers = value.slice(0, 6)
  if (!numbers.every((item) => typeof item === "number")) return undefined
  const [a, b, c, d, e, f] = numbers
  if (a === undefined || b === undefined || c === undefined || d === undefined || e === undefined || f === undefined) {
    return undefined
  }
  return [a, b, c, d, e, f]
}

function multiply(left: Matrix, right: Matrix): Matrix {
  const [a1, b1, c1, d1, e1, f1] = left
  const [a2, b2, c2, d2, e2, f2] = right
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ]
}

function corners(matrix: Matrix): Array<[number, number]> {
  return [apply(matrix, 0, 0), apply(matrix, 1, 0), apply(matrix, 0, 1), apply(matrix, 1, 1)]
}

function apply(matrix: Matrix, x: number, y: number): [number, number] {
  return [matrix[0] * x + matrix[2] * y + matrix[4], matrix[1] * x + matrix[3] * y + matrix[5]]
}

function numberAt(values: unknown[], index: number): number {
  const value = values[index]
  return typeof value === "number" ? value : 0
}
