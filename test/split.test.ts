import assert from "node:assert/strict"
import { test } from "node:test"
import { run } from "../src/run.ts"
import { pdfText, pdfWithText } from "./fixtures.ts"

test("split keeps the clicked pages in that order", async () => {
  const result = await run({
    tool: "split-pdf",
    pdf: { name: "pages.pdf", bytes: await pdfWithText(["A", "B", "C"]) },
    pages: [3, 1],
  })
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.filename, "split.pdf")
  assert.deepEqual(await pdfText(result.file), ["C", "A"])
})

test("split with no pages returns no file", async () => {
  const result = await run({
    tool: "split-pdf",
    pdf: { name: "pages.pdf", bytes: await pdfWithText(["A"]) },
    pages: [],
  })
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(Object.hasOwn(result, "file"), false)
})
