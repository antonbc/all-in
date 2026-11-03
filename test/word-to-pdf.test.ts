import assert from "node:assert/strict"
import { test } from "node:test"
import { run } from "../src/run.ts"
import { docxFrom, letterDocx, longLetterDocx, pdfText } from "./fixtures.ts"

test("Word to PDF keeps the header line and the body paragraph", async () => {
  const result = await run({
    tool: "word-to-pdf",
    pageSize: "original",
    docx: { name: "letter.docx", bytes: await letterDocx() },
  })
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.filename, "document.pdf")
  const text = (await pdfText(result.file)).join("\n")
  assert.match(text, /LETTERHEAD/)
  assert.match(text, /Body paragraph/)
  assert.match(text, /Footer line/)
})

test("header text is repeated on each page", async () => {
  const result = await run({
    tool: "word-to-pdf",
    pageSize: "original",
    docx: { name: "letter.docx", bytes: await longLetterDocx() },
  })
  assert.equal(result.ok, true)
  if (!result.ok) return
  const pages = await pdfText(result.file)
  assert.ok(pages.length >= 2)
  for (const page of pages) assert.match(page, /LETTERHEAD/)
  const all = pages.join("\n")
  assert.match(all, /Sentence 1/)
  assert.match(all, /Sentence 80/)
})

test("a Word file that is only a text box has no usable body", async () => {
  const result = await run({
    tool: "word-to-pdf",
    pageSize: "original",
    docx: {
      name: "box.docx",
      bytes: docxFrom(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:pict><w:txbxContent><w:p><w:r><w:t>Only in a box</w:t></w:r></w:p></w:txbxContent></w:pict></w:r></w:p>
  </w:body>
</w:document>`),
    },
  })
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(Object.hasOwn(result, "file"), false)
  assert.match(result.message, /box\.docx/)
  assert.match(result.message, /no usable body/)
})

test("columns, comments, and tracked changes are named and left out of the body", async () => {
  const result = await run({
    tool: "word-to-pdf",
    pageSize: "a4",
    docx: {
      name: "notes.docx",
      bytes: docxFrom(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:commentRangeStart w:id="0"/>
      <w:r><w:t>Visible body</w:t></w:r>
      <w:commentRangeEnd w:id="0"/>
      <w:r><w:commentReference w:id="0"/></w:r>
    </w:p>
    <w:p>
      <w:ins w:id="1" w:author="A" w:date="2020-01-01T00:00:00Z"><w:r><w:t>kept</w:t></w:r></w:ins>
      <w:del w:id="2" w:author="A" w:date="2020-01-01T00:00:00Z"><w:r><w:delText>gone</w:delText></w:r></w:del>
    </w:p>
    <w:sectPr><w:cols w:num="2"/><w:pgSz w:w="12240" w:h="15840"/></w:sectPr>
  </w:body>
</w:document>`,
        {
          "word/comments.xml": `<?xml version="1.0" encoding="UTF-8"?>
<w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:comment w:id="0"><w:p><w:r><w:t>Secret comment</w:t></w:r></w:p></w:comment>
</w:comments>`,
        },
      ),
    },
  })
  assert.equal(result.ok, true)
  if (!result.ok) return
  const text = (await pdfText(result.file)).join("\n")
  assert.match(text, /Visible body/)
  assert.doesNotMatch(text, /kept/)
  assert.doesNotMatch(text, /gone/)
  assert.doesNotMatch(text, /Secret comment/)
  assert.match(result.notice ?? "", /Columns/)
  assert.match(result.notice ?? "", /comments/)
  assert.match(result.notice ?? "", /tracked changes/)
})

test("an old .doc file is refused", async () => {
  const result = await run({
    tool: "word-to-pdf",
    pageSize: "original",
    docx: { name: "old.doc", bytes: new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0, 0, 0, 0]) },
  })
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.match(result.message, /old\.doc/)
  assert.equal(Object.hasOwn(result, "file"), false)
})
