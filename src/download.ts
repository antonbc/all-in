export function download(file: Uint8Array, filename: string, mediaType: string): void {
  const blob = new Blob([file.slice()], { type: mediaType })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1500)
}
