import assert from "node:assert/strict"
import { test } from "node:test"
import { run } from "../src/run.ts"
import { blankPages } from "./fixtures.ts"

test("cancel aborts run and returns no file", async () => {
  const controller = new AbortController()
  controller.abort()
  const result = await run(
    {
      tool: "merge",
      pdfs: [
        { name: "one.pdf", bytes: await blankPages(1) },
        { name: "two.pdf", bytes: await blankPages(1) },
      ],
    },
    { signal: controller.signal },
  )
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(Object.hasOwn(result, "file"), false)
})

test("cancel during a job returns no file", async () => {
  const controller = new AbortController()
  const result = await run(
    {
      tool: "merge",
      pdfs: [
        { name: "one.pdf", bytes: await blankPages(2) },
        { name: "two.pdf", bytes: await blankPages(2) },
      ],
    },
    {
      signal: controller.signal,
      onProgress: () => {
        controller.abort()
      },
    },
  )
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(Object.hasOwn(result, "file"), false)
})
