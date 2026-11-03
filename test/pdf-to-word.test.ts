import assert from "node:assert/strict"
import { test } from "node:test"
import { run } from "../src/run.ts"
import { docxXml, helloThenScan, helloWithPicture, scannedPage } from "./fixtures.ts"

test("selectable text is kept and that page is not named in the notice", async () => {
  const result = await run({
    tool: "pdf-to-word",
    pdf: { name: "hello.pdf", bytes: await helloWithPicture() },
  })
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.filename, "document.docx")
  const docx = docxXml(result.file)
  assert.match(docx.xml, /Hello/)
  assert.equal(result.notice?.includes("Page 1") ?? false, false)
  assert.equal(docx.media.length, 1)
  assert.ok(docx.xml.indexOf("Hello") < docx.xml.indexOf("blip"))
})

test("a page with no text is named in the notice and is not a full-page photo", async () => {
  const result = await run({
    tool: "pdf-to-word",
    pdf: { name: "scan.pdf", bytes: await scannedPage() },
  })
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.match(result.notice ?? "", /Page 1/)
  assert.equal(docxXml(result.file).media.length, 0)
})

test("a scanned page beside a text page does not embed the scan", async () => {
  const result = await run({
    tool: "pdf-to-word",
    pdf: { name: "mixed.pdf", bytes: await helloThenScan() },
  })
  assert.equal(result.ok, true)
  if (!result.ok) return
  const docx = docxXml(result.file)
  assert.match(docx.xml, /Hello/)
  assert.equal(docx.media.length, 1)
  assert.match(result.notice ?? "", /Page 2/)
  assert.equal(result.notice?.includes("Page 1") ?? false, false)
})
