import assert from "node:assert/strict"
import { test } from "node:test"
import { run } from "../src/run.ts"
import { blankPages, encryptedPdf, pdfText, pdfWithText } from "./fixtures.ts"

test("merge keeps each PDF's pages in list order", async () => {
  const result = await run({
    tool: "merge",
    pdfs: [
      { name: "one.pdf", bytes: await pdfWithText(["ONE"]) },
      { name: "two.pdf", bytes: await pdfWithText(["TWO", "THREE"]) },
    ],
  })
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.filename, "merged.pdf")
  assert.deepEqual(await pdfText(result.file), ["ONE", "TWO", "THREE"])
})

test("merge refuses a result past 100 pages and returns no file", async () => {
  const result = await run({
    tool: "merge",
    pdfs: [
      { name: "left.pdf", bytes: await blankPages(60) },
      { name: "right.pdf", bytes: await blankPages(41) },
    ],
  })
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(Object.hasOwn(result, "file"), false)
  assert.match(result.message, /100 pages/)
})

test("a password-protected PDF fails and names the file", async () => {
  const result = await run({
    tool: "merge",
    pdfs: [
      { name: "open.pdf", bytes: await blankPages(1) },
      { name: "secret.pdf", bytes: await encryptedPdf() },
    ],
  })
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(Object.hasOwn(result, "file"), false)
  assert.match(result.message, /secret\.pdf/)
  assert.doesNotMatch(result.message, /open\.pdf/)
})
