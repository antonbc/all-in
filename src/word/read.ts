import { strFromU8, unzipSync } from "fflate"
import { XMLParser } from "fast-xml-parser"
import { sniff } from "../bytes.ts"
import { asArray, isRecord } from "../record.ts"

export type Omission = "columns" | "text boxes" | "comments" | "tracked changes"

export type WordBlock =
  | { kind: "paragraph"; text: string; role: "body" | "heading" | "list" }
  | { kind: "image"; bytes: Uint8Array; mediaType: "image/png" | "image/jpeg" }

export type WordDocument = {
  blocks: WordBlock[]
  header: string
  footer: string
  page: { width: number; height: number } | undefined
  omissions: Omission[]
}

type Flags = {
  columns: boolean
  textBoxes: boolean
  comments: boolean
  trackedChanges: boolean
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  parseTagValue: false,
  parseAttributeValue: false,
  isArray: (name) =>
    ["p", "r", "t", "ins", "del", "hyperlink", "headerReference", "footerReference", "Relationship", "blip"].includes(
      name,
    ),
})

export function readDocx(bytes: Uint8Array, name: string): { ok: true; document: WordDocument } | { ok: false; message: string } {
  const kind = sniff(bytes)
  if (kind === "doc") return { ok: false, message: `${name} is an old .doc file. Use a .docx.` }
  if (kind !== "zip") return { ok: false, message: `${name} is not a .docx file.` }
  let zip: Record<string, Uint8Array>
  try {
    zip = unzipSync(bytes)
  } catch {
    return { ok: false, message: `${name} is not a .docx file.` }
  }
  const documentXml = zip["word/document.xml"]
  if (!documentXml) return { ok: false, message: `${name} is not a .docx file.` }

  const flags: Flags = { columns: false, textBoxes: false, comments: false, trackedChanges: false }
  if (zip["word/comments.xml"]) flags.comments = true
  const parsed = parseXml(strFromU8(documentXml))
  const body = isRecord(parsed) && isRecord(parsed.document) ? parsed.document.body : undefined
  const relationships = readRelationships(zip, "word/document.xml")
  const page = { value: undefined as { width: number; height: number } | undefined }
  if (isRecord(body)) noteSection(body.sectPr, flags, page, relationships)
  const blocks = asArray(isRecord(body) ? body.p : undefined).flatMap((paragraph) =>
    paragraphBlocks(paragraph, flags, relationships, zip, page),
  )
  const header = partText(zip, relationships, "header", flags)
  const footer = partText(zip, relationships, "footer", flags)
  return {
    ok: true,
    document: {
      blocks: blocks.filter((block) => block.kind === "image" || block.text.trim() !== ""),
      header,
      footer,
      page: page.value,
      omissions: omissions(flags),
    },
  }
}

export function omissionNotice(items: readonly Omission[]): string | undefined {
  if (items.length === 0) return undefined
  const sentence = joinList([...items])
  return `${sentence.slice(0, 1).toUpperCase()}${sentence.slice(1)} were left out.`
}

function omissions(flags: Flags): Omission[] {
  const items: Omission[] = []
  if (flags.columns) items.push("columns")
  if (flags.textBoxes) items.push("text boxes")
  if (flags.comments) items.push("comments")
  if (flags.trackedChanges) items.push("tracked changes")
  return items
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? ""
  if (items.length === 2) return `${items[0]} and ${items[1]}`
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`
}

function paragraphBlocks(
  paragraph: unknown,
  flags: Flags,
  relationships: Map<string, Relationship>,
  zip: Record<string, Uint8Array>,
  page: { value: { width: number; height: number } | undefined },
): WordBlock[] {
  if (!isRecord(paragraph)) return []
  noteSection(isRecord(paragraph.pPr) ? paragraph.pPr.sectPr : undefined, flags, page, relationships)
  const role = roleOf(paragraph)
  const text = plainText(paragraph, flags).replace(/\s+/g, " ").trim()
  const blocks: WordBlock[] = []
  if (text !== "") {
    blocks.push({ kind: "paragraph", text: role === "list" ? `- ${text}` : text, role })
  }
  for (const id of embedIds(paragraph, flags)) {
    const image = imageBytes(zip, relationships, id)
    if (image) blocks.push({ kind: "image", bytes: image.bytes, mediaType: image.mediaType })
  }
  return blocks
}

function roleOf(paragraph: Record<string, unknown>): "body" | "heading" | "list" {
  if (!isRecord(paragraph.pPr)) return "body"
  if ("numPr" in paragraph.pPr) return "list"
  const style = paragraph.pPr.pStyle
  if (isRecord(style) && typeof style["@_val"] === "string" && /heading/i.test(style["@_val"])) return "heading"
  return "body"
}

function partText(
  zip: Record<string, Uint8Array>,
  relationships: Map<string, Relationship>,
  kind: "header" | "footer",
  flags: Flags,
): string {
  const matches = [...relationships.values()].filter((relationship) => relationship.type.includes(`/${kind}`))
  const preferred = matches.find((relationship) => relationship.role === "default") ?? matches[0]
  if (!preferred) return ""
  const path = resolveTarget("word/document.xml", preferred.target)
  const bytes = zip[path]
  if (!bytes) return ""
  const parsed = parseXml(strFromU8(bytes))
  if (!isRecord(parsed)) return ""
  const root = parsed.hdr ?? parsed.ftr
  return plainText(root, flags).replace(/\s+/g, " ").trim()
}

type Relationship = { type: string; target: string; role?: string }

function readRelationships(zip: Record<string, Uint8Array>, part: string): Map<string, Relationship> {
  const map = new Map<string, Relationship>()
  const bytes = zip[relsPath(part)]
  if (!bytes) return map
  const parsed = parseXml(strFromU8(bytes))
  if (!isRecord(parsed) || !isRecord(parsed.Relationships)) return map
  for (const relationship of asArray(parsed.Relationships.Relationship)) {
    if (!isRecord(relationship)) continue
    if (typeof relationship["@_Id"] !== "string" || typeof relationship["@_Type"] !== "string" || typeof relationship["@_Target"] !== "string") {
      continue
    }
    map.set(relationship["@_Id"], { type: relationship["@_Type"], target: relationship["@_Target"] })
  }
  return map
}

function noteSection(
  sect: unknown,
  flags: Flags,
  page: { value: { width: number; height: number } | undefined },
  relationships: Map<string, Relationship>,
): void {
  if (!isRecord(sect)) return
  if (isRecord(sect.cols)) {
    const count = Number(sect.cols["@_num"] ?? "1")
    if (count > 1) flags.columns = true
  }
  const size = pageSizeOf(sect.pgSz)
  if (size) page.value = size
  for (const reference of asArray(sect.headerReference)) assignRole(reference, relationships)
  for (const reference of asArray(sect.footerReference)) assignRole(reference, relationships)
}

function assignRole(reference: unknown, relationships: Map<string, Relationship>): void {
  if (!isRecord(reference) || typeof reference["@_id"] !== "string" || typeof reference["@_type"] !== "string") return
  const relationship = relationships.get(reference["@_id"])
  if (relationship) relationship.role = reference["@_type"]
}

function pageSizeOf(value: unknown): { width: number; height: number } | undefined {
  if (!isRecord(value) || typeof value["@_w"] !== "string" || typeof value["@_h"] !== "string") return undefined
  const width = Number(value["@_w"]) / 20
  const height = Number(value["@_h"]) / 20
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return undefined
  return { width, height }
}

function imageBytes(
  zip: Record<string, Uint8Array>,
  relationships: Map<string, Relationship>,
  id: string,
): { bytes: Uint8Array; mediaType: "image/png" | "image/jpeg" } | undefined {
  const relationship = relationships.get(id)
  if (!relationship || !relationship.type.includes("/image")) return undefined
  const bytes = zip[resolveTarget("word/document.xml", relationship.target)]
  if (!bytes) return undefined
  const kind = sniff(bytes)
  if (kind === "png") return { bytes, mediaType: "image/png" }
  if (kind === "jpeg") return { bytes, mediaType: "image/jpeg" }
  return undefined
}

function embedIds(node: unknown, flags: Flags, ids: string[] = []): string[] {
  if (Array.isArray(node)) {
    for (const item of node) embedIds(item, flags, ids)
    return ids
  }
  if (!isRecord(node)) return ids
  for (const [key, value] of Object.entries(node)) {
    if (key === "txbxContent") {
      flags.textBoxes = true
      continue
    }
    if (key === "blip") {
      for (const blip of asArray(value)) {
        if (isRecord(blip) && typeof blip["@_embed"] === "string") ids.push(blip["@_embed"])
      }
      continue
    }
    embedIds(value, flags, ids)
  }
  return ids
}

function plainText(node: unknown, flags: Flags): string {
  if (Array.isArray(node)) return node.map((item) => plainText(item, flags)).join("")
  if (!isRecord(node)) return ""
  const pieces: string[] = []
  for (const [key, value] of Object.entries(node)) {
    if (key === "pPr" || key === "rPr" || key === "sectPr" || key === "tbl") continue
    if (key === "txbxContent") {
      flags.textBoxes = true
      continue
    }
    if (key === "del" || key === "delText" || key === "ins") {
      flags.trackedChanges = true
      continue
    }
    if (key === "commentReference" || key === "commentRangeStart" || key === "commentRangeEnd") {
      flags.comments = true
      continue
    }
    if (key === "t") {
      pieces.push(textValue(value))
      continue
    }
    if (key === "tab" || key === "br" || key === "cr") {
      pieces.push(" ")
      continue
    }
    if (key === "p") {
      const text = asArray(value)
        .map((item) => plainText(item, flags).trim())
        .filter((item) => item.length > 0)
        .join("\n")
      if (text) pieces.push(text)
      continue
    }
    if (typeof value === "string" || typeof value === "number") continue
    pieces.push(plainText(value, flags))
  }
  return pieces.join("")
}

function textValue(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value)
  if (Array.isArray(value)) return value.map((item) => textValue(item)).join("")
  if (isRecord(value) && (typeof value["#text"] === "string" || typeof value["#text"] === "number")) {
    return String(value["#text"])
  }
  return ""
}

function parseXml(xml: string): unknown {
  const value: unknown = parser.parse(xml)
  return value
}

function relsPath(part: string): string {
  const pieces = part.split("/")
  const file = pieces.pop() ?? ""
  return [...pieces, "_rels", `${file}.rels`].join("/")
}

function resolveTarget(part: string, target: string): string {
  if (target.startsWith("/")) return target.slice(1)
  const stack = part.split("/").slice(0, -1)
  for (const piece of target.split("/")) {
    if (piece === "..") stack.pop()
    else if (piece !== "." && piece !== "") stack.push(piece)
  }
  return stack.join("/")
}
