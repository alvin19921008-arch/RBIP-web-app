/**
 * Screenshot capture utilities using html-to-image.
 * Captures the full page DOM as a PNG data URL, with optional region crop.
 */

export async function captureFullPage(): Promise<string | null> {
  try {
    const { toPng } = await import('html-to-image')
    const node = document.body
    const dataUrl = await toPng(node, {
      quality: 0.85,
      pixelRatio: Math.min(window.devicePixelRatio, 2),
      // Exclude the feedback drawer/button from the capture
      filter: (node) => {
        if (node instanceof HTMLElement) {
          if (node.dataset.feedbackExclude === 'true') return false
        }
        return true
      },
    })
    return dataUrl
  } catch (err) {
    console.warn('[screenshot] captureFullPage failed:', err)
    return null
  }
}

export interface CropRect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Crops a data URL (full-page capture) to the given rect.
 * rect coordinates are in CSS pixels relative to document origin.
 */
export async function cropDataUrl(
  dataUrl: string,
  rect: CropRect,
  devicePixelRatio: number = 1
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const dpr = Math.min(devicePixelRatio, 2)
      const canvas = document.createElement('canvas')
      canvas.width = rect.width * dpr
      canvas.height = rect.height * dpr
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('No canvas context'))
        return
      }
      ctx.drawImage(
        img,
        rect.x * dpr,
        rect.y * dpr,
        rect.width * dpr,
        rect.height * dpr,
        0,
        0,
        rect.width * dpr,
        rect.height * dpr
      )
      resolve(canvas.toDataURL('image/png', 0.9))
    }
    img.onerror = reject
    img.src = dataUrl
  })
}

/** Upload a base64 data URL to the server, returns a blob URL */
export async function uploadScreenshot(dataUrl: string): Promise<string | null> {
  try {
    const res = await fetch(dataUrl)
    const blob = await res.blob()
    const formData = new FormData()
    formData.append('file', blob, 'screenshot.png')

    const response = await fetch('/api/feedback/screenshot', {
      method: 'POST',
      body: formData,
    })

    if (!response.ok) return null
    const { url } = await response.json()
    return url as string
  } catch {
    return null
  }
}

/** Collect auto-context snapshot */
export function collectAutoContext(params?: {
  userRole?: string
  workflowStep?: number | null
  scheduleDate?: string | null
}): import('./types').FeedbackAutoContext {
  const ua = navigator.userAgent
  const browser = parseBrowser(ua)
  const os = parseOS(ua)

  return {
    url: window.location.pathname,
    userRole: params?.userRole ?? 'unknown',
    browser,
    os,
    timestamp: new Date().toISOString(),
    workflowStep: params?.workflowStep ?? null,
    scheduleDate: params?.scheduleDate ?? null,
    viewportSize: `${window.innerWidth}x${window.innerHeight}`,
  }
}

function parseBrowser(ua: string): string {
  if (ua.includes('Edg/')) return 'Edge'
  if (ua.includes('Chrome/')) return 'Chrome'
  if (ua.includes('Firefox/')) return 'Firefox'
  if (ua.includes('Safari/') && !ua.includes('Chrome')) return 'Safari'
  return 'Unknown'
}

function parseOS(ua: string): string {
  if (ua.includes('Windows NT')) return 'Windows'
  if (ua.includes('Mac OS X')) return 'macOS'
  if (ua.includes('Linux')) return 'Linux'
  if (ua.includes('iPhone') || ua.includes('iPad')) return 'iOS'
  if (ua.includes('Android')) return 'Android'
  return 'Unknown'
}
