import assert from "node:assert/strict"
import { test } from "node:test"
import { createCanvas } from "@napi-rs/canvas"
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs"
import { isPaintContext } from "../src/pdf/pdfjs.ts"
import { run } from "../src/run.ts"
import { pdfPageInfo, solidJpeg, solidPng } from "./fixtures.ts"

test("a wide image on A4 uses landscape and is not cropped", async () => {
  const result = await run({
    tool: "png-to-pdf",
    pageSize: "a4",
    images: [{ name: "wide.png", bytes: solidPng(200, 100, 220, 20, 20) }],
  })
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.filename, "images.pdf")
  const [page] = await pdfPageInfo(result.file)
  assert.ok(page)
  assert.ok(page.width > page.height)
  assert.ok(Math.abs(page.width - 841.89) < 1)
  assert.ok(Math.abs(page.height - 595.28) < 1)
  const box = await redBox(result.file)
  const aspect = box.width / box.height
  assert.ok(Math.abs(aspect - 2) < 0.08, `aspect ${aspect}`)
  assert.ok(box.top > 4)
  assert.ok(box.bottom < box.pageHeight - 4)
})

test("PNG to PDF refuses a JPEG", async () => {
  const result = await run({
    tool: "png-to-pdf",
    pageSize: "original",
    images: [{ name: "photo.jpg", bytes: solidJpeg(20, 20) }],
  })
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.match(result.message, /photo\.jpg/)
})

async function redBox(bytes: Uint8Array): Promise<{ width: number; height: number; top: number; bottom: number; pageHeight: number }> {
  const pdf = await getDocument({ data: bytes.slice() }).promise
  const page = await pdf.getPage(1)
  const viewport = page.getViewport({ scale: 1 })
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height))
  const context = canvas.getContext("2d")
  if (!isPaintContext(context)) throw new Error("Could not draw the page")
  await page.render({ canvas: context.canvas, viewport }).promise
  const data = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data
  let minX = canvas.width
  let minY = canvas.height
  let maxX = 0
  let maxY = 0
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      const index = (y * canvas.width + x) * 4
      const red = data[index] ?? 0
      const green = data[index + 1] ?? 0
      const blue = data[index + 2] ?? 0
      if (red > 180 && green < 80 && blue < 80) {
        minX = Math.min(minX, x)
        minY = Math.min(minY, y)
        maxX = Math.max(maxX, x)
        maxY = Math.max(maxY, y)
      }
    }
  }
  await pdf.destroy()
  return { width: maxX - minX + 1, height: maxY - minY + 1, top: minY, bottom: maxY, pageHeight: canvas.height }
}
