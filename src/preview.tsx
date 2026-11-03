import { useEffect, useRef, useState } from "react"
import type { PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs"
import type { Success } from "./domain.ts"
import { openPdfJs } from "./pdf/pdfjs.ts"
import { readDocx } from "./word/read.ts"
import { unzipSync } from "fflate"

export function Preview({ result }: { result: Success }) {
  if (result.mediaType === "application/pdf") return <PdfPreview bytes={result.file} />
  if (result.mediaType === "application/zip") return <ZipPreview bytes={result.file} />
  if (result.mediaType.startsWith("image/")) return <ImagePreview bytes={result.file} mediaType={result.mediaType} name={result.filename} />
  if (result.filename.endsWith(".docx")) return <WordPreview bytes={result.file} />
  return <p>This preview could not be drawn.</p>
}

function PdfPreview({ bytes }: { bytes: Uint8Array }) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null)
  const [count, setCount] = useState(0)
  const [message, setMessage] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    let opened: PDFDocumentProxy | undefined
    void openPdfJs(bytes)
      .then((document) => {
        if (cancelled) {
          void document.destroy()
          return
        }
        opened = document
        setPdf(document)
        setCount(document.numPages)
      })
      .catch(() => {
        if (!cancelled) setMessage("This preview could not be drawn.")
      })
    return () => {
      cancelled = true
      void opened?.destroy()
    }
  }, [bytes])
  if (message) return <p>{message}</p>
  return (
    <div className="preview">
      {pdf &&
        Array.from({ length: count }, (_, index) => (
          <PdfPage key={index + 1} pdf={pdf} pageNumber={index + 1} />
        ))}
    </div>
  )
}

function PdfPage({ pdf, pageNumber }: { pdf: PDFDocumentProxy; pageNumber: number }) {
  const holder = useRef<HTMLElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const node = holder.current
    if (!node) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setVisible(true)
      },
      { rootMargin: "600px 0px" },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    if (!visible) return
    let cancelled = false
    void (async () => {
      const page = await pdf.getPage(pageNumber)
      if (cancelled) return
      const viewport = page.getViewport({ scale: 1.2 })
      const canvas = canvasRef.current
      if (!canvas) return
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      const context = canvas.getContext("2d")
      if (!context) return
      await page.render({ canvas, viewport }).promise
    })()
    return () => {
      cancelled = true
    }
  }, [visible, pdf, pageNumber])
  return (
    <figure className="preview-page" ref={holder}>
      <figcaption>Page {pageNumber}</figcaption>
      <canvas ref={canvasRef} />
    </figure>
  )
}

function ImagePreview({ bytes, mediaType, name }: { bytes: Uint8Array; mediaType: string; name: string }) {
  const url = useObjectUrl(bytes, mediaType)
  if (!url) return null
  return (
    <div className="preview">
      <img src={url} alt={name} />
    </div>
  )
}

function ZipPreview({ bytes }: { bytes: Uint8Array }) {
  const entries = unzipSync(bytes)
  const names = Object.keys(entries)
  return (
    <div className="preview">
      {names.map((name) => {
        const file = entries[name]
        if (!file) return null
        const mediaType = name.endsWith(".png") ? "image/png" : "image/jpeg"
        return <NamedImage key={name} name={name} bytes={file} mediaType={mediaType} />
      })}
    </div>
  )
}

function NamedImage({ name, bytes, mediaType }: { name: string; bytes: Uint8Array; mediaType: string }) {
  const url = useObjectUrl(bytes, mediaType)
  if (!url) return null
  return (
    <figure className="preview-page">
      <figcaption>{name}</figcaption>
      <img src={url} alt={name} />
    </figure>
  )
}

function WordPreview({ bytes }: { bytes: Uint8Array }) {
  const read = readDocx(bytes, "document.docx")
  if (!read.ok) return <p>This preview could not be drawn.</p>
  return (
    <article className="reading">
      {read.document.header !== "" && <p className="running-head">{read.document.header}</p>}
      {read.document.blocks.map((block, index) =>
        block.kind === "paragraph" ? (
          <p key={index} className={block.role === "heading" ? "reading-heading" : undefined}>
            {block.text}
          </p>
        ) : (
          <WordImage key={index} bytes={block.bytes} mediaType={block.mediaType} />
        ),
      )}
      {read.document.footer !== "" && <p className="running-foot">{read.document.footer}</p>}
    </article>
  )
}

function WordImage({ bytes, mediaType }: { bytes: Uint8Array; mediaType: string }) {
  const url = useObjectUrl(bytes, mediaType)
  if (!url) return null
  return <img src={url} alt="" />
}

function useObjectUrl(bytes: Uint8Array, mediaType: string): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    const next = URL.createObjectURL(new Blob([bytes.slice()], { type: mediaType }))
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [bytes, mediaType])
  return url
}
