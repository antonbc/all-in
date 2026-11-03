import assert from "node:assert/strict"
import { test } from "node:test"
import { run } from "../src/run.ts"
import { pdfPageInfo, solidJpeg, solidPng } from "./fixtures.ts"

test("images to PDF puts one image on each page in order", async () => {
  const result = await run({
    tool: "images-to-pdf",
    pageSize: "original",
    images: [
      { name: "wide.png", bytes: solidPng(200, 100, 220, 20, 20) },
      { name: "photo.jpg", bytes: solidJpeg(80, 120) },
    ],
  })
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.filename, "images.pdf")
  const pages = await pdfPageInfo(result.file)
  assert.equal(pages.length, 2)
  assert.ok(Math.abs((pages[0]?.width ?? 0) - 200) < 0.1)
  assert.ok(Math.abs((pages[0]?.height ?? 0) - 100) < 0.1)
  assert.ok(Math.abs((pages[1]?.width ?? 0) - 80) < 0.1)
  assert.ok(Math.abs((pages[1]?.height ?? 0) - 120) < 0.1)
})

test("WebP is refused", async () => {
  const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 24, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])
  const result = await run({
    tool: "images-to-pdf",
    pageSize: "original",
    images: [{ name: "photo.webp", bytes: webp }],
  })
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.match(result.message, /photo\.webp/)
  assert.match(result.message, /WebP/)
})
