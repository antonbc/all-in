import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs"
import { isRecord } from "../record.ts"

export async function openPdfJs(bytes: Uint8Array): Promise<pdfjs.PDFDocumentProxy> {
  const task = pdfjs.getDocument({
    data: bytes.slice(),
    useSystemFonts: true,
    standardFontDataUrl: typeof document === "undefined" ? undefined : `${import.meta.env.BASE_URL}standard_fonts/`,
  })
  return task.promise
}

export function isPaintContext(value: unknown): value is CanvasRenderingContext2D {
  if (!isRecord(value)) return false
  return (
    typeof value.fillRect === "function" &&
    typeof value.drawImage === "function" &&
    typeof value.save === "function" &&
    typeof value.restore === "function" &&
    typeof value.scale === "function" &&
    typeof value.setTransform === "function" &&
    "canvas" in value
  )
}
