import assert from "node:assert/strict"
import { test } from "node:test"
import { run } from "../src/run.ts"
import { blankPages, pdfPages, pngDimensions, zipEntries } from "./fixtures.ts"

test("one PDF page downloads a PNG at twice the page size in points", async () => {
  const result = await run({
    tool: "pdf-to-png",
    pdf: { name: "wide.pdf", bytes: await pdfPages([{ width: 200, height: 100 }]) },
  })
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.filename, "page.png")
  assert.equal(result.mediaType, "image/png")
  assert.deepEqual(pngDimensions(result.file), { width: 400, height: 200 })
})

test("two PDF pages download a zip of PNGs in order", async () => {
  const result = await run({
    tool: "pdf-to-png",
    pdf: {
      name: "pages.pdf",
      bytes: await pdfPages([
        { width: 200, height: 100 },
        { width: 100, height: 200 },
      ]),
    },
  })
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.filename, "pages.zip")
  const entries = zipEntries(result.file)
  assert.deepEqual(Object.keys(entries), ["page-1.png", "page-2.png"])
  const first = entries["page-1.png"]
  const second = entries["page-2.png"]
  assert.ok(first && second)
  assert.deepEqual(pngDimensions(first), { width: 400, height: 200 })
  assert.deepEqual(pngDimensions(second), { width: 200, height: 400 })
})

test("a PDF over 100 pages is refused before a render", async () => {
  const result = await run({
    tool: "pdf-to-png",
    pdf: { name: "book.pdf", bytes: await blankPages(101) },
  })
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.match(result.message, /book\.pdf/)
  assert.match(result.message, /100 pages/)
})
