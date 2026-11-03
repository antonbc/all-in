import { zlibSync } from "fflate"

export type FileKind = "pdf" | "png" | "jpeg" | "webp" | "doc" | "zip" | "unknown"

export function sniff(bytes: Uint8Array): FileKind {
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "pdf"
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png"
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "jpeg"
  if (
    bytes.length >= 12 &&
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "webp"
  }
  if (startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0])) return "doc"
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) return "zip"
  return "unknown"
}

export function pngSize(bytes: Uint8Array): { width: number; height: number } | undefined {
  if (sniff(bytes) !== "png" || bytes.byteLength < 24) return undefined
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const width = view.getUint32(16)
  const height = view.getUint32(20)
  if (width === 0 || height === 0) return undefined
  return { width, height }
}

export function jpegSize(bytes: Uint8Array): { width: number; height: number } | undefined {
  if (sniff(bytes) !== "jpeg") return undefined
  let offset = 2
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) return undefined
    const marker = bytes[offset + 1] ?? 0
    if (marker === 0xd8 || marker === 0x01) {
      offset += 2
      continue
    }
    if (marker === 0xd9) return undefined
    const length = ((bytes[offset + 2] ?? 0) << 8) + (bytes[offset + 3] ?? 0)
    if (length < 2 || offset + 2 + length > bytes.length) return undefined
    const isStartOfFrame =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
    if (isStartOfFrame) {
      const height = ((bytes[offset + 5] ?? 0) << 8) + (bytes[offset + 6] ?? 0)
      const width = ((bytes[offset + 7] ?? 0) << 8) + (bytes[offset + 8] ?? 0)
      if (width === 0 || height === 0) return undefined
      return { width, height }
    }
    offset += 2 + length
  }
  return undefined
}

export function imageSize(bytes: Uint8Array): { width: number; height: number } | undefined {
  const kind = sniff(bytes)
  if (kind === "png") return pngSize(bytes)
  if (kind === "jpeg") return jpegSize(bytes)
  return undefined
}

const CRC_TABLE = new Uint32Array(256)
for (let index = 0; index < 256; index += 1) {
  let value = index
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  }
  CRC_TABLE[index] = value
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type)
  const out = new Uint8Array(12 + data.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, data.length)
  out.set(typeBytes, 4)
  out.set(data, 8)
  const signed = new Uint8Array(out.buffer, 4, 4 + data.length)
  view.setUint32(8 + data.length, crc32(signed))
  return out
}

export function encodePng(width: number, height: number, rgba: Uint8Array): Uint8Array {
  const stride = width * 4
  const raw = new Uint8Array((stride + 1) * height)
  for (let y = 0; y < height; y += 1) {
    const row = y * (stride + 1)
    raw[row] = 0
    raw.set(rgba.subarray(y * stride, (y + 1) * stride), row + 1)
  }
  const ihdr = new Uint8Array(13)
  const view = new DataView(ihdr.buffer)
  view.setUint32(0, width)
  view.setUint32(4, height)
  ihdr[8] = 8
  ihdr[9] = 6
  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
  const compressed = zlib(raw)
  return concat([signature, chunk("IHDR", ihdr), chunk("IDAT", compressed), chunk("IEND", new Uint8Array())])
}

export function rgbaFromPixels(
  width: number,
  height: number,
  data: Uint8Array,
  kind: "rgb" | "rgba" | "gray",
): Uint8Array | undefined {
  const rgba = new Uint8Array(width * height * 4)
  if (kind === "rgba") {
    if (data.length < rgba.length) return undefined
    rgba.set(data.subarray(0, rgba.length))
    return rgba
  }
  if (kind === "rgb") {
    if (data.length < width * height * 3) return undefined
    for (let pixel = 0; pixel < width * height; pixel += 1) {
      rgba[pixel * 4] = data[pixel * 3] ?? 0
      rgba[pixel * 4 + 1] = data[pixel * 3 + 1] ?? 0
      rgba[pixel * 4 + 2] = data[pixel * 3 + 2] ?? 0
      rgba[pixel * 4 + 3] = 255
    }
    return rgba
  }
  if (data.length < width * height) return undefined
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const gray = data[pixel] ?? 0
    rgba[pixel * 4] = gray
    rgba[pixel * 4 + 1] = gray
    rgba[pixel * 4 + 2] = gray
    rgba[pixel * 4 + 3] = 255
  }
  return rgba
}

function zlib(data: Uint8Array): Uint8Array {
  return zlibSync(data)
}

function concat(parts: Uint8Array[]): Uint8Array {
  const size = parts.reduce((total, part) => total + part.length, 0)
  const out = new Uint8Array(size)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

function startsWith(bytes: Uint8Array, prefix: number[]): boolean {
  if (bytes.length < prefix.length) return false
  return prefix.every((value, index) => bytes[index] === value)
}
