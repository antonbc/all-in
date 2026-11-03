import assert from "node:assert/strict"
import { test } from "node:test"
import { run } from "../src/run.ts"
import { pdfPageInfo, pdfWithText } from "./fixtures.ts"

test("rotate turns every page the same way", async () => {
  const bytes = await pdfWithText(["A", "B"])
  const clockwise = await run({ tool: "rotate-pdf", pdf: { name: "pages.pdf", bytes }, turn: "cw" })
  const counter = await run({ tool: "rotate-pdf", pdf: { name: "pages.pdf", bytes }, turn: "ccw" })
  const half = await run({ tool: "rotate-pdf", pdf: { name: "pages.pdf", bytes }, turn: "180" })
  assert.equal(clockwise.ok && counter.ok && half.ok, true)
  if (!clockwise.ok || !counter.ok || !half.ok) return
  assert.equal(clockwise.filename, "rotated.pdf")
  assert.deepEqual((await pdfPageInfo(clockwise.file)).map((page) => page.angle), [90, 90])
  assert.deepEqual((await pdfPageInfo(counter.file)).map((page) => page.angle), [270, 270])
  assert.deepEqual((await pdfPageInfo(half.file)).map((page) => page.angle), [180, 180])
})
