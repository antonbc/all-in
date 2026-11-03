import { deflateSync } from "node:zlib"
import { Document, Footer, Header, Packer, Paragraph, TextRun } from "docx"
import { strFromU8, unzipSync, zipSync } from "fflate"
import { PDFDocument, PDFHexString, StandardFonts } from "pdf-lib"
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs"
import { createCanvas } from "@napi-rs/canvas"

export function solidPng(width: number, height: number, red: number, green: number, blue: number): Uint8Array {
  const raw = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 4 + 1)
    raw[row] = 0
    for (let x = 0; x < width; x += 1) {
      const index = row + 1 + x * 4
      raw[index] = red
      raw[index + 1] = green
      raw[index + 2] = blue
      raw[index + 3] = 255
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  return new Uint8Array(
    Buffer.concat([signature, pngChunk("IHDR", ihdr), pngChunk("IDAT", deflateSync(raw)), pngChunk("IEND", Buffer.alloc(0))]),
  )
}

export function solidJpeg(width: number, height: number): Uint8Array {
  const canvas = createCanvas(width, height)
  const context = canvas.getContext("2d")
  context.fillStyle = "rgb(220, 30, 30)"
  context.fillRect(0, 0, width, height)
  return new Uint8Array(canvas.toBuffer("image/jpeg", 90))
}

export async function pdfPages(sizes: Array<{ width: number; height: number; text?: string }>): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (const size of sizes) {
    const page = doc.addPage([size.width, size.height])
    if (size.text) page.drawText(size.text, { x: 24, y: size.height / 2, size: 18, font })
  }
  return doc.save()
}

export async function pdfWithText(lines: string[]): Promise<Uint8Array> {
  return pdfPages(lines.map((text) => ({ width: 240, height: 240, text })))
}

export async function blankPages(count: number): Promise<Uint8Array> {
  return pdfPages(Array.from({ length: count }, () => ({ width: 200, height: 200 })))
}

export async function encryptedPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.addPage([200, 200])
  const encrypt = doc.context.obj({
    Filter: "Standard",
    V: 1,
    R: 2,
    O: PDFHexString.of("00".repeat(32)),
    U: PDFHexString.of("00".repeat(32)),
    P: -4,
  })
  doc.context.trailerInfo.Encrypt = doc.context.register(encrypt)
  return doc.save()
}

export async function helloWithPicture(): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const page = doc.addPage([300, 400])
  const font = await doc.embedFont(StandardFonts.Helvetica)
  page.drawText("Hello", { x: 30, y: 340, size: 24, font })
  const image = await doc.embedPng(solidPng(20, 10, 200, 20, 20))
  page.drawImage(image, { x: 30, y: 40, width: 80, height: 40 })
  return doc.save()
}

export async function scannedPage(): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const page = doc.addPage([300, 400])
  const image = await doc.embedPng(solidPng(30, 40, 20, 20, 20))
  page.drawImage(image, { x: 0, y: 0, width: 300, height: 400 })
  return doc.save()
}

export async function helloThenScan(): Promise<Uint8Array> {
  const first = await PDFDocument.load(await helloWithPicture())
  const second = await PDFDocument.load(await scannedPage())
  const doc = await PDFDocument.create()
  const [hello] = await doc.copyPages(first, [0])
  const [scan] = await doc.copyPages(second, [0])
  if (!hello || !scan) throw new Error("missing page")
  doc.addPage(hello)
  doc.addPage(scan)
  return doc.save()
}

export async function pdfText(bytes: Uint8Array): Promise<string[]> {
  const pdf = await getDocument({ data: bytes.slice() }).promise
  const pages: string[] = []
  for (let number = 1; number <= pdf.numPages; number += 1) {
    const page = await pdf.getPage(number)
    const content = await page.getTextContent()
    pages.push(content.items.map((item) => ("str" in item ? item.str : "")).join(""))
  }
  await pdf.destroy()
  return pages
}

export async function pdfPageInfo(bytes: Uint8Array): Promise<Array<{ width: number; height: number; angle: number }>> {
  const doc = await PDFDocument.load(bytes)
  return doc.getPages().map((page) => {
    const size = page.getSize()
    return { width: size.width, height: size.height, angle: page.getRotation().angle }
  })
}

export function pngDimensions(bytes: Uint8Array): { width: number; height: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return { width: view.getUint32(16), height: view.getUint32(20) }
}

export function jpegDimensions(bytes: Uint8Array): { width: number; height: number } {
  let offset = 2
  while (offset + 8 < bytes.length) {
    const marker = bytes[offset + 1] ?? 0
    const length = ((bytes[offset + 2] ?? 0) << 8) + (bytes[offset + 3] ?? 0)
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return {
        height: ((bytes[offset + 5] ?? 0) << 8) + (bytes[offset + 6] ?? 0),
        width: ((bytes[offset + 7] ?? 0) << 8) + (bytes[offset + 8] ?? 0),
      }
    }
    offset += 2 + length
  }
  throw new Error("JPEG has no size")
}

export function zipEntries(bytes: Uint8Array): Record<string, Uint8Array> {
  return unzipSync(bytes)
}

export function docxXml(bytes: Uint8Array): { xml: string; media: string[] } {
  const unzipped = unzipSync(bytes)
  const xmlBytes = unzipped["word/document.xml"]
  return {
    xml: xmlBytes ? strFromU8(xmlBytes) : "",
    media: Object.keys(unzipped).filter((name) => name.startsWith("word/media/")),
  }
}

export async function letterDocx(): Promise<Uint8Array> {
  const doc = new Document({
    sections: [
      {
        headers: {
          default: new Header({ children: [new Paragraph({ children: [new TextRun("LETTERHEAD")] })] }),
        },
        footers: {
          default: new Footer({ children: [new Paragraph({ children: [new TextRun("Footer line")] })] }),
        },
        children: [new Paragraph("Body paragraph")],
      },
    ],
  })
  return new Uint8Array(await Packer.toBuffer(doc))
}

export async function longLetterDocx(): Promise<Uint8Array> {
  const doc = new Document({
    sections: [
      {
        headers: {
          default: new Header({ children: [new Paragraph({ children: [new TextRun("LETTERHEAD")] })] }),
        },
        children: Array.from({ length: 80 }, (_, index) => new Paragraph(`Sentence ${index + 1}`)),
      },
    ],
  })
  return new Uint8Array(await Packer.toBuffer(doc))
}

export function docxFrom(documentXml: string, extra: Record<string, string> = {}): Uint8Array {
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": text(contentTypes),
    "_rels/.rels": text(packageRels),
    "word/document.xml": text(documentXml),
    "word/_rels/document.xml.rels": text(documentRels),
  }
  for (const [name, contents] of Object.entries(extra)) files[name] = text(contents)
  return zipSync(files)
}

const contentTypes = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`

const packageRels = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`

const documentRels = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`

function text(value: string): Uint8Array {
  return new TextEncoder().encode(value)
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBytes = Buffer.from(type)
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])))
  return Buffer.concat([length, typeBytes, data, crc])
}

function crc32(data: Buffer): number {
  let crc = 0xffffffff
  for (const byte of data) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return (crc ^ 0xffffffff) >>> 0
}
