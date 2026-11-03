import assert from "node:assert/strict"
import { test } from "node:test"
import { run } from "../src/run.ts"
import { pdfPageInfo, solidJpeg } from "./fixtures.ts"

test("a tall image on Letter stays portrait", async () => {
  const result = await run({
    tool: "jpeg-to-pdf",
    pageSize: "letter",
    images: [{ name: "tall.jpg", bytes: solidJpeg(100, 200) }],
  })
  assert.equal(result.ok, true)
  if (!result.ok) return
  const [page] = await pdfPageInfo(result.file)
  assert.ok(page)
  assert.ok(page.height > page.width)
  assert.ok(Math.abs(page.width - 612) < 1)
  assert.ok(Math.abs(page.height - 792) < 1)
})
