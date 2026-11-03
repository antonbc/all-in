export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  const megabytes = bytes / (1024 * 1024)
  const digits = megabytes >= 10 ? 0 : 1
  return `${megabytes.toFixed(digits)} MB`
}
