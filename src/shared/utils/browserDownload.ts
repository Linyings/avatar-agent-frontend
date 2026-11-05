const sanitizeFileName = (fileName: string, fallback: string) => {
  const normalized = fileName.trim() || fallback
  return normalized.replace(/[\\/:*?"<>|]+/g, '_')
}

export const downloadBlob = (blob: Blob, fileName: string, fallback = 'download') => {
  const objectUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = objectUrl
  link.download = sanitizeFileName(fileName, fallback)
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)

  window.setTimeout(() => {
    URL.revokeObjectURL(objectUrl)
  }, 1000)
}
