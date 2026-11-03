import { PDFDocument, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib"
import { sniff } from "../bytes.ts"
import {
  A4,
  CANCELED_MESSAGE,
  failure,
  isCanceled,
  LETTER,
  MAX_BYTES,
  MAX_PAGES,
  success,
  type NamedBytes,
  type PageSize,
  type Result,
  type RunOptions,
} from "../domain.ts"
import { omissionNotice, readDocx } from "./read.ts"

const MARGIN = 54

export async function wordToPdf(file: NamedBytes, pageSize: PageSize, options: RunOptions): Promise<Result> {
  if (file.bytes.byteLength > MAX_BYTES) return failure(`${file.name} is over 200 MB.`)
  const kind = sniff(file.bytes)
  if (kind === "doc") return failure(`${file.name} is an old .doc file. Use a .docx.`)
  options.onProgress?.({ completed: 0, total: 1 })
  if (isCanceled(options.signal)) return failure(CANCELED_MESSAGE)
  const read = readDocx(file.bytes, file.name)
  if (!read.ok) return read
  const usable = read.document.blocks.some(
    (block) => block.kind === "image" || block.text.trim() !== "",
  )
  if (!usable) return failure(`${file.name} has no usable body.`)

  const paper = chosenPaper(pageSize, read.document.page)
  const pdf = await PDFDocument.create()
  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const header = printable(regular, read.document.header)
  const footer = printable(regular, read.document.footer)
  const contentTop = paper.height - MARGIN - (header === "" ? 0 : 22)
  const contentBottom = MARGIN + (footer === "" ? 0 : 22)
  const contentWidth = paper.width - MARGIN * 2

  let page = addPage(pdf, paper, regular, header, footer)
  let y = contentTop
  let pageCount = 1

  for (const block of read.document.blocks) {
    if (isCanceled(options.signal)) return failure(CANCELED_MESSAGE)
    if (block.kind === "paragraph") {
      const font = block.role === "heading" ? bold : regular
      const size = block.role === "heading" ? 18 : 12
      const lines = wrap(printable(font, block.text), font, size, contentWidth - (block.role === "list" ? 12 : 0))
      for (const line of lines) {
        const lineHeight = size * 1.35
        const fits = y - lineHeight >= contentBottom
        if (!fits && y < contentTop - 1) {
          if (pageCount >= MAX_PAGES) return failure(`${file.name} would be over 100 pages.`)
          page = addPage(pdf, paper, regular, header, footer)
          pageCount += 1
          y = contentTop
        }
        page.drawText(line, {
          x: MARGIN + (block.role === "list" ? 12 : 0),
          y: y - size,
          size,
          font,
        })
        y -= lineHeight
      }
      y -= 6
      continue
    }
    const embedded = block.mediaType === "image/png" ? await pdf.embedPng(block.bytes) : await pdf.embedJpg(block.bytes)
    const available = contentTop - contentBottom
    const scale = Math.min(contentWidth / embedded.width, available / embedded.height)
    const width = embedded.width * scale
    const height = embedded.height * scale
    if (y - height < contentBottom) {
      if (y !== contentTop) {
        if (pageCount >= MAX_PAGES) return failure(`${file.name} would be over 100 pages.`)
        page = addPage(pdf, paper, regular, header, footer)
        pageCount += 1
        y = contentTop
      }
    }
    page.drawImage(embedded, { x: MARGIN, y: y - height, width, height })
    y -= height + 8
  }

  if (isCanceled(options.signal)) return failure(CANCELED_MESSAGE)
  options.onProgress?.({ completed: 1, total: 1 })
  return success(await pdf.save(), "application/pdf", "document.pdf", omissionNotice(read.document.omissions))
}

function addPage(
  pdf: PDFDocument,
  paper: { width: number; height: number },
  font: PDFFont,
  header: string,
  footer: string,
): PDFPage {
  const page = pdf.addPage([paper.width, paper.height])
  if (header !== "") page.drawText(header, { x: MARGIN, y: paper.height - 36, size: 10, font })
  if (footer !== "") page.drawText(footer, { x: MARGIN, y: 28, size: 10, font })
  return page
}

function chosenPaper(
  pageSize: PageSize,
  declared: { width: number; height: number } | undefined,
): { width: number; height: number } {
  if (pageSize === "original") return declared ?? { width: A4.width, height: A4.height }
  const base = pageSize === "a4" ? A4 : LETTER
  if (declared && declared.width > declared.height) return { width: base.height, height: base.width }
  return { width: base.width, height: base.height }
}

function printable(font: PDFFont, text: string): string {
  let out = ""
  for (const char of text) {
    try {
      font.widthOfTextAtSize(char, 12)
      out += char
    } catch {
      out += "?"
    }
  }
  return out
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter((word) => word.length > 0)
  if (words.length === 0) return []
  const lines: string[] = []
  let current = ""
  for (const word of words) {
    const pieces = splitWide(word, font, size, maxWidth)
    for (const piece of pieces) {
      const next = current === "" ? piece : `${current} ${piece}`
      if (font.widthOfTextAtSize(next, size) <= maxWidth) current = next
      else {
        if (current !== "") lines.push(current)
        current = piece
      }
    }
  }
  if (current !== "") lines.push(current)
  return lines
}

function splitWide(word: string, font: PDFFont, size: number, maxWidth: number): string[] {
  if (font.widthOfTextAtSize(word, size) <= maxWidth) return [word]
  const pieces: string[] = []
  let current = ""
  for (const char of word) {
    const next = current + char
    if (font.widthOfTextAtSize(next, size) <= maxWidth) current = next
    else {
      if (current !== "") pieces.push(current)
      current = char
    }
  }
  if (current !== "") pieces.push(current)
  return pieces
}
