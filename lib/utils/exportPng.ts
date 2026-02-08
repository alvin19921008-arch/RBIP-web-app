import { toBlob } from 'html-to-image'

export async function renderElementToPngBlob(
  el: HTMLElement,
  opts?: {
    pixelRatio?: number
    backgroundColor?: string
  }
): Promise<Blob> {
  const blob = await toBlob(el, {
    cacheBust: true,
    pixelRatio: typeof opts?.pixelRatio === 'number' ? opts.pixelRatio : 2,
    backgroundColor: opts?.backgroundColor,
  })
  if (!blob) {
    throw new Error('Failed to render PNG (empty blob)')
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

