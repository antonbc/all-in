import assert from "node:assert/strict"
import { test } from "node:test"

test("pull requests can run the test runner", () => {
  assert.equal(1 + 1, 2)
})
