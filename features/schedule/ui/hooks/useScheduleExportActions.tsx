'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ImageDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Tooltip } from '@/components/ui/tooltip'
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { downloadBlobAsFile, renderElementToImageBlob } from '@/lib/utils/exportPng'

export type ScheduleExportShowActionToast = (
  title: string,
  variant?: unknown,
  description?: string,
  options?: {
    durationMs?: number
    actions?: ReactNode
    progress?: import('@/components/ui/action-toast').ActionToastProgress
    persistUntilDismissed?: boolean
    dismissOnOutsideClick?: boolean
    showDurationProgress?: boolean
    pauseOnHover?: boolean
  }
) => number

export type ScheduleExportUpdateActionToast = (
  id: number,
  patch: unknown,
  options?: { durationMs?: number; persistUntilDismissed?: boolean }
) => void

export function useScheduleExportActions({
  selectedDate,
  toDateKey,
  showActionToast,
  updateActionToast,
  copying,
  saving,
}: {
  selectedDate: Date
  toDateKey: (d: Date) => string
  showActionToast: ScheduleExportShowActionToast
  updateActionToast: ScheduleExportUpdateActionToast
  copying: boolean
  saving: boolean
}) {
  const [exportPngLayerOpen, setExportPngLayerOpen] = useState(false)
  const [exportingPng, setExportingPng] = useState(false)
  const [isLikelyMobileDevice, setIsLikelyMobileDevice] = useState(false)
  const [mobilePreviewOpen, setMobilePreviewOpen] = useState(false)
  const [mobilePreviewUrl, setMobilePreviewUrl] = useState<string | null>(null)
  const [mobilePreviewFilename, setMobilePreviewFilename] = useState('')
  const exportPngRootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const detectMobile = () => {
      const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
      const uaMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua)
      const narrowViewport = typeof window !== 'undefined' && window.matchMedia('(max-width: 900px)').matches
      const coarsePointer = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
      setIsLikelyMobileDevice(uaMobile || (narrowViewport && coarsePointer))
    }

    detectMobile()
    window.addEventListener('resize', detectMobile)
    return () => window.removeEventListener('resize', detectMobile)
  }, [])

  const closeMobilePreview = useCallback(() => {
    setMobilePreviewOpen(false)
    if (mobilePreviewUrl) {
      URL.revokeObjectURL(mobilePreviewUrl)
      setMobilePreviewUrl(null)
    }
    setMobilePreviewFilename('')
  }, [mobilePreviewUrl])

  useEffect(() => {
    return () => {
      if (mobilePreviewUrl) URL.revokeObjectURL(mobilePreviewUrl)
    }
  }, [mobilePreviewUrl])

  const exportAllocationImage = useCallback(
    async (mode: 'download' | 'save-image') => {
      if (exportingPng) return
      setExportingPng(true)

      const dateKey = toDateKey(selectedDate)
      const useJpeg = isLikelyMobileDevice
      const format = useJpeg ? 'jpeg' : 'png'
      const extension = useJpeg ? 'jpg' : 'png'
      const filename = `RBIP-allocation-${dateKey}.${extension}`

      const toastId = showActionToast('Exporting allocation…', 'info', 'Preparing layout…', {
        persistUntilDismissed: true,
        progress: { kind: 'indeterminate' },
      })

      const nextPaint = () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        })

      try {
        setExportPngLayerOpen(true)
        exportPngRootRef.current = null
        await nextPaint()

        updateActionToast(toastId, { description: 'Rendering image…', progress: { kind: 'indeterminate' } })

        const el = exportPngRootRef.current
        if (!el) throw new Error('Export view not ready')

        await nextPaint()

        const bg = window.getComputedStyle(el).backgroundColor
        const blob = await renderElementToImageBlob(el, {
          format,
          quality: useJpeg ? 0.82 : undefined,
          pixelRatio: useJpeg ? 1.1 : 2,
          backgroundColor: bg,
        })

        if (mode === 'save-image') {
          setMobilePreviewUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev)
            return URL.createObjectURL(blob)
          })
          setMobilePreviewFilename(filename)
          setMobilePreviewOpen(true)
          updateActionToast(
            toastId,
            {
              title: 'Preview ready',
              variant: 'success',
              description: 'Long press the image to save to Photos.',
              progress: undefined,
            },
            { persistUntilDismissed: false, durationMs: 3200 }
          )
        } else {
          updateActionToast(toastId, { description: 'Downloading…', progress: { kind: 'indeterminate' } })
          downloadBlobAsFile(blob, filename)
          updateActionToast(
            toastId,
            { title: 'Downloaded', variant: 'success', description: filename, progress: undefined },
            { persistUntilDismissed: false, durationMs: 2500 }
          )
        }
      } catch (e) {
        const msg = (e as any)?.message || 'Export failed'
        updateActionToast(
          toastId,
          { title: 'Export failed', variant: 'error', description: msg, progress: undefined },
          { persistUntilDismissed: false, durationMs: 4500 }
        )
      } finally {
        setExportPngLayerOpen(false)
        setExportingPng(false)
      }
    },
    [exportingPng, selectedDate, toDateKey, isLikelyMobileDevice, showActionToast, updateActionToast]
  )

  const renderExportAction = useCallback(() => {
    const disabled = exportingPng || copying || saving
    const label = exportingPng ? 'Exporting…' : 'Export'

    if (isLikelyMobileDevice) {
      return (
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" type="button" disabled={disabled} className="flex items-center">
              <ImageDown className="h-4 w-4 mr-2" />
              {label}
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            side="bottom"
            className="w-44 rounded-md border border-border bg-background p-1 shadow-lg"
          >
            <PopoverClose asChild>
              <button
                type="button"
                className="w-full rounded-sm px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                onClick={() => {
                  void exportAllocationImage('download')
                }}
                disabled={disabled}
              >
                Download
              </button>
            </PopoverClose>
            <PopoverClose asChild>
              <button
                type="button"
                className="w-full rounded-sm px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                onClick={() => {
                  void exportAllocationImage('save-image')
                }}
                disabled={disabled}
              >
                Save as image
              </button>
            </PopoverClose>
          </PopoverContent>
        </Popover>
      )
    }

    return (
      <Tooltip side="bottom" content="Export Blocks 1–6 + PCA Dedicated Schedule as an image.">
        <Button
          variant="outline"
          type="button"
          onClick={() => void exportAllocationImage('download')}
          disabled={disabled}
          className="flex items-center"
        >
          <ImageDown className="h-4 w-4 mr-2" />
          {label}
        </Button>
      </Tooltip>
    )
  }, [copying, saving, exportingPng, isLikelyMobileDevice, exportAllocationImage])

  const mobilePreviewDialog = useMemo(
    () => (
      <Dialog
        open={mobilePreviewOpen}
        onOpenChange={(open) => {
          if (open) {
            setMobilePreviewOpen(true)
            return
          }
          closeMobilePreview()
        }}
      >
        <DialogContent className="w-[95vw] max-w-[95vw] sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Save as image</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Long press the image below, then tap Save to Photos.</p>
            {mobilePreviewUrl ? (
              <div className="rounded-md border border-border overflow-hidden bg-background">
                <img src={mobilePreviewUrl} alt="Export preview" className="block w-full h-auto" loading="eager" />
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">Preview unavailable.</div>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (!mobilePreviewUrl) return
                const opened = window.open(mobilePreviewUrl, '_blank', 'noopener,noreferrer')
                if (!opened) {
                  showActionToast('Popup blocked. Long press the preview image instead.', 'info')
                }
              }}
            >
              Open in new tab
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (!mobilePreviewUrl) return
                const a = document.createElement('a')
                a.href = mobilePreviewUrl
                a.download = mobilePreviewFilename || 'RBIP-allocation.jpg'
                a.rel = 'noopener'
                a.click()
              }}
            >
              Download copy
            </Button>
            <Button type="button" onClick={closeMobilePreview}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    ),
    [
      mobilePreviewOpen,
      mobilePreviewUrl,
      mobilePreviewFilename,
      closeMobilePreview,
      showActionToast,
    ]
  )

  return {
    isLikelyMobileDevice,
    exportPngLayerOpen,
    exportPngRootRef,
    renderExportAction,
    mobilePreviewDialog,
  }
}
