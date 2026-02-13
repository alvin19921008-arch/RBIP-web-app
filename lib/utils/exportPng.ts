import { toBlob } from 'html-to-image'

type ExportImageFormat = 'png' | 'jpeg'

export async function renderElementToImageBlob(
  el: HTMLElement,
  opts?: {
    pixelRatio?: number
    backgroundColor?: string
    format?: ExportImageFormat
    quality?: number
  }
): Promise<Blob> {
  const format = opts?.format === 'jpeg' ? 'jpeg' : 'png'
  const blob = await toBlob(el, {
    cacheBust: true,
    pixelRatio: typeof opts?.pixelRatio === 'number' ? opts.pixelRatio : 2,
    backgroundColor: opts?.backgroundColor,
    type: format === 'jpeg' ? 'image/jpeg' : 'image/png',
    quality: format === 'jpeg' ? (typeof opts?.quality === 'number' ? opts.quality : 0.9) : undefined,
  })
  if (!blob) {
    throw new Error('Failed to render image (empty blob)')
  }
  return blob
}

export function downloadBlobAsFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  try {
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.rel = 'noopener'
    a.click()
  } finally {
    // Let the browser start the download first.
    window.setTimeout(() => URL.revokeObjectURL(url), 1500)
  }
}

export async function shareImageBlob(
  blob: Blob,
  filename: string,
  opts?: { title?: string; text?: string }
): Promise<boolean> {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') return false

  const file = new File([blob], filename, {
    type: blob.type || (filename.toLowerCase().endsWith('.jpg') ? 'image/jpeg' : 'image/png'),
  })

  if (typeof navigator.canShare === 'function' && !navigator.canShare({ files: [file] })) {
    return false
  }

  await navigator.share({
    title: opts?.title ?? 'RBIP allocation',
    text: opts?.text,
    files: [file],
  })
  return true
}

