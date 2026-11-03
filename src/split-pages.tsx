import { useEffect, useState } from "react"
import { openPdfJs } from "./pdf/pdfjs.ts"

export function SplitPages({
  bytes,
  selected,
  onSelect,
}: {
  bytes: Uint8Array
  selected: number[]
  onSelect: (page: number) => void
}) {
  const [thumbs, setThumbs] = useState<Array<{ page: number; url: string }>>([])
  useEffect(() => {
    let cancelled = false
    const urls: string[] = []
    void (async () => {
      const pdf = await openPdfJs(bytes)
      try {
        const next: Array<{ page: number; url: string }> = []
        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
          if (cancelled) return
          const page = await pdf.getPage(pageNumber)
          const base = page.getViewport({ scale: 1 })
          const viewport = page.getViewport({ scale: 120 / base.width })
          const canvas = document.createElement("canvas")
          canvas.width = Math.ceil(viewport.width)
          canvas.height = Math.ceil(viewport.height)
          const context = canvas.getContext("2d")
          if (!context) continue
          await page.render({ canvas, viewport }).promise
          const url = canvas.toDataURL("image/jpeg", 0.72)
          urls.push(url)
          next.push({ page: pageNumber, url })
          if (!cancelled) setThumbs(next.slice())
        }
      } finally {
        await pdf.destroy()
      }
    })()
    return () => {
      cancelled = true
    }
  }, [bytes])
  return (
    <div className="thumbs" role="list">
      {thumbs.map((thumb) => {
        const order = selected.indexOf(thumb.page)
        return (
          <button
            key={thumb.page}
            type="button"
            className={order >= 0 ? "thumb picked" : "thumb"}
            aria-pressed={order >= 0}
            onClick={() => onSelect(thumb.page)}
          >
            <img src={thumb.url} alt="" />
            <span>Page {thumb.page}</span>
            {order >= 0 && <b>{order + 1}</b>}
          </button>
        )
      })}
    </div>
  )
}
