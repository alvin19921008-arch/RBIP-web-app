'use client'

import { useState, useEffect, useCallback } from 'react'
import { createPortal, flushSync } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Crop, RefreshCw, ThumbsUp, Loader2, Check, Camera, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_TYPE_LABELS,
  FEEDBACK_SEVERITY_LABELS,
  SEVERITY_TYPES,
  getCategoryLabel,
  getSubCategoryLabel,
  type FeedbackType,
  type FeedbackSeverity,
} from '@/lib/feedback/categories'
import { RegionSelector } from './RegionSelector'
import { captureFullPage, cropDataUrl, type CropRect } from '@/lib/feedback/screenshot'
import type { FeedbackReport } from '@/lib/feedback/types'

interface FeedbackFormProps {
  userRole: string
  userName: string | null
  onSubmitSuccess?: (ticketNumber: number) => void
  /** When inside the drawer: compact mode */
  compact?: boolean
  /** Called when entering/leaving crop region mode — drawer should slide off when true */
  onCropModeChange?: (active: boolean) => void
}

interface SimilarIssueRowProps {
  report: FeedbackReport
  upvotedIds: Set<string>
  onUpvote: (id: string) => void
}

function SimilarIssueRow({ report, upvotedIds, onUpvote }: SimilarIssueRowProps) {
  const isUpvoted = upvotedIds.has(report.id)
  const [optimisticCount, setOptimisticCount] = useState(report.upvote_count)
  const [pending, setPending] = useState(false)

  const handleUpvote = async () => {
    if (pending) return
    setPending(true)
    setOptimisticCount(c => isUpvoted ? c - 1 : c + 1)
    await onUpvote(report.id)
    setPending(false)
  }

  return (
    <div className="flex items-start justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{report.title}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {getCategoryLabel(report.category)}
          {report.sub_category ? ` · ${getSubCategoryLabel(report.category, report.sub_category)}` : ''}
        </p>
      </div>
      <button
        onClick={handleUpvote}
        className={`inline-flex items-center gap-1 text-xs font-medium flex-shrink-0 mt-0.5 transition-colors select-none ${
          isUpvoted
            ? 'text-sky-600 hover:text-sky-700'
            : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        <ThumbsUp className="h-3.5 w-3.5" />
        {optimisticCount}
      </button>
    </div>
  )
}

export function FeedbackForm({ userRole, userName, onSubmitSuccess, compact = false, onCropModeChange }: FeedbackFormProps) {
  const [phase, setPhase] = useState<'similar' | 'form' | 'success'>('similar')
  const [similarReports, setSimilarReports] = useState<FeedbackReport[]>([])
  const [upvotedIds, setUpvotedIds] = useState<Set<string>>(new Set())
  const [loadingSimilar, setLoadingSimilar] = useState(true)

  // Form state
  const [type, setType] = useState<FeedbackType | ''>('')
  const [severity, setSeverity] = useState<FeedbackSeverity | ''>('')
  const [category, setCategory] = useState('')
  const [subCategory, setSubCategory] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [steps, setSteps] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submittedTicket, setSubmittedTicket] = useState<number | null>(null)

  // Screenshot state
  const [screenshotDataUrl, setScreenshotDataUrl] = useState<string | null>(null)
  const [capturingScreenshot, setCapturingScreenshot] = useState(false)
  const [regionSelectorActive, setRegionSelectorActive] = useState(false)
  const [fullPageDataUrl, setFullPageDataUrl] = useState<string | null>(null)

  const needsSeverity = SEVERITY_TYPES.includes(type as FeedbackType)
  const subCategories = FEEDBACK_CATEGORIES.find(c => c.id === category)?.subCategories ?? []

  // Load similar reports + user upvotes
  const refreshSimilar = useCallback(() => {
    let cancelled = false
    setLoadingSimilar(true)
    Promise.all([
      fetch('/api/feedback?mode=similar').then(r => r.json()),
      fetch('/api/feedback/upvote').then(r => r.json()),
    ]).then(([reportsRes, upvotesRes]) => {
      if (cancelled) return
      setSimilarReports(reportsRes.reports ?? [])
      setUpvotedIds(new Set(upvotesRes.upvotedIds ?? []))
      setLoadingSimilar(false)
    }).catch(() => {
      if (!cancelled) setLoadingSimilar(false)
    })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const cleanup = refreshSimilar()
    return cleanup
  }, [refreshSimilar])

  const handleUpvote = useCallback(async (reportId: string) => {
    const res = await fetch('/api/feedback/upvote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ report_id: reportId }),
    })
    const data = await res.json()
    setUpvotedIds(prev => {
      const next = new Set(prev)
      if (data.upvoted) next.add(reportId)
      else next.delete(reportId)
      return next
    })
    // Update count in list
    setSimilarReports(prev =>
      prev.map(r => r.id === reportId
        ? { ...r, upvote_count: r.upvote_count + (data.upvoted ? 1 : -1) }
        : r
      )
    )
  }, [])

  // Preload html-to-image when form mounts so "Capture now" is fast
  useEffect(() => {
    import('html-to-image')
  }, [])

  const handleCaptureNow = useCallback(async () => {
    flushSync(() => setCapturingScreenshot(true))
    await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())))
    const dataUrl = await captureFullPage()
    setFullPageDataUrl(dataUrl)
    setScreenshotDataUrl(dataUrl)
    setCapturingScreenshot(false)
  }, [])

  const handleRetake = async () => {
    flushSync(() => setCapturingScreenshot(true))
    await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())))
    const dataUrl = await captureFullPage()
    setFullPageDataUrl(dataUrl)
    setScreenshotDataUrl(dataUrl)
    setCapturingScreenshot(false)
  }

  const handleCropRegion = () => {
    setRegionSelectorActive(true)
    onCropModeChange?.(true)
  }

  const handleRegionConfirm = async (rect: CropRect) => {
    setRegionSelectorActive(false)
    onCropModeChange?.(false)
    if (!fullPageDataUrl) return
    const cropped = await cropDataUrl(fullPageDataUrl, rect, window.devicePixelRatio)
    setScreenshotDataUrl(cropped)
  }

  const handleRegionCancel = () => {
    setRegionSelectorActive(false)
    onCropModeChange?.(false)
  }

  const handleDiscardScreenshot = () => {
    setScreenshotDataUrl(null)
    setFullPageDataUrl(null)
  }

  const handleSubmit = async () => {
    if (!type || !category || !title.trim() || !description.trim()) return
    setSubmitting(true)

    try {
      // Upload screenshot if present
      let screenshotUrl: string | null = null
      if (screenshotDataUrl) {
        const { uploadScreenshot } = await import('@/lib/feedback/screenshot')
        screenshotUrl = await uploadScreenshot(screenshotDataUrl)
      }

      const { collectAutoContext } = await import('@/lib/feedback/screenshot')
      const autoContext = collectAutoContext({ userRole })

      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          severity: needsSeverity && severity ? severity : null,
          category,
          sub_category: subCategory || null,
          title: title.trim(),
          description: description.trim(),
          steps_to_reproduce: needsSeverity && steps.trim() ? steps.trim() : null,
          screenshot_url: screenshotUrl,
          auto_context: autoContext,
          submitter_name: userName,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      setSubmittedTicket(data.report.ticket_number)
      setPhase('success')
      onSubmitSuccess?.(data.report.ticket_number)
    } catch (err) {
      console.error(err)
    } finally {
      setSubmitting(false)
    }
  }

  const canSubmit = !!type && !!category && title.trim().length > 0 && description.trim().length > 0

  // ─── REGION SELECTOR — portalled so it stays visible when drawer slides off ──
  if (regionSelectorActive && typeof document !== 'undefined') {
    return createPortal(
      <RegionSelector
        active
        onConfirm={handleRegionConfirm}
        onCancel={handleRegionCancel}
      />,
      document.body
    )
  }

  // ─── SUCCESS STATE ────────────────────────────────────────────────────
  if (phase === 'success') {
    const handleReset = () => {
      refreshSimilar()
      setPhase('similar')
      setType('')
      setSeverity('')
      setCategory('')
      setSubCategory('')
      setTitle('')
      setDescription('')
      setSteps('')
      setScreenshotDataUrl(null)
      setFullPageDataUrl(null)
      setSubmittedTicket(null)
    }

    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center gap-4 py-10 px-4 text-center"
      >
        <div className="h-12 w-12 rounded-full bg-emerald-50 flex items-center justify-center">
          <Check className="h-6 w-6 text-emerald-600" />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">Report submitted</p>
          <p className="text-xs text-muted-foreground mt-1">
            Ticket <span className="font-mono text-foreground">#{submittedTicket?.toString().padStart(3, '0')}</span>
          </p>
        </div>
        <p className="text-xs text-muted-foreground max-w-[240px]">
          The developer has been notified. You&apos;ll see a reply here when it&apos;s been reviewed.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleReset}
          className="mt-2 gap-1.5 text-xs"
        >
          ← Back to issues
        </Button>
      </motion.div>
    )
  }

  // ─── SIMILAR ISSUES PHASE ──────────────────────────────────────────────
  if (phase === 'similar') {
    return (
      <div className="flex flex-col">
        <div className="px-5 pb-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Similar issues
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            +1 if your issue matches an existing report, or report a new one below.
          </p>
        </div>

        <div className="px-5 divide-y divide-border">
          {loadingSimilar ? (
            <div className="py-8 flex justify-center">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : similarReports.length === 0 ? (
            <p className="py-6 text-xs text-muted-foreground text-center">No open reports yet.</p>
          ) : (
            similarReports.map((report, i) => (
              <motion.div
                key={report.id}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.04 + i * 0.04, duration: 0.2 }}
              >
                <SimilarIssueRow
                  report={report}
                  upvotedIds={upvotedIds}
                  onUpvote={handleUpvote}
                />
              </motion.div>
            ))
          )}
        </div>

        <div className="px-5 pt-4 pb-2">
          <Button
            variant="default"
            size="sm"
            className="w-full"
            onClick={() => setPhase('form')}
          >
            Report a new issue
          </Button>
        </div>
      </div>
    )
  }

  // ─── FORM PHASE ──────────────────────────────────────────────────────
  const fieldClass = "bg-muted/40 border border-border rounded-md px-3 py-2 text-sm w-full focus:outline-none focus:ring-1 focus:ring-ring"
  const labelClass = "text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
  /** When in drawer (compact), dropdowns must render above z-[9000] */
  const selectContentClass = compact ? 'z-[9100]' : ''

  return (
    <div className="flex flex-col gap-5 px-5 pb-4">
      {/* Title */}
      <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }}>
        <label className={labelClass}>Title</label>
        <input
          className={`${fieldClass} mt-1`}
          placeholder="One-line summary of the issue..."
          value={title}
          onChange={e => setTitle(e.target.value)}
        />
      </motion.div>

      {/* Type + Severity */}
      <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
        <div className="flex gap-3">
          <div className="flex-1">
            <label className={labelClass}>Type</label>
            <Select value={type} onValueChange={v => setType(v as FeedbackType)}>
              <SelectTrigger className="mt-1 h-9 bg-muted/40 border-border text-sm">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent className={selectContentClass}>
                {(Object.entries(FEEDBACK_TYPE_LABELS) as [FeedbackType, string][]).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <AnimatePresence>
            {needsSeverity && (
              <motion.div
                className="flex-1"
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: 'auto' }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ duration: 0.2 }}
              >
                <label className={labelClass}>Severity</label>
                <Select value={severity} onValueChange={v => setSeverity(v as FeedbackSeverity)}>
                  <SelectTrigger className="mt-1 h-9 bg-muted/40 border-border text-sm">
                    <SelectValue placeholder="Severity" />
                  </SelectTrigger>
                  <SelectContent className={selectContentClass}>
                    {(Object.entries(FEEDBACK_SEVERITY_LABELS) as [FeedbackSeverity, string][]).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Category + Sub-category */}
      <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.10 }}>
        <label className={labelClass}>Category</label>
        <div className="flex flex-col gap-2 mt-1">
          <Select value={category} onValueChange={v => { setCategory(v); setSubCategory('') }}>
            <SelectTrigger className="h-9 bg-muted/40 border-border text-sm">
              <SelectValue placeholder="Select category" />
            </SelectTrigger>
            <SelectContent className={selectContentClass}>
              {FEEDBACK_CATEGORIES.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <AnimatePresence>
            {subCategories.length > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.18 }}
              >
                <Select value={subCategory} onValueChange={setSubCategory}>
                  <SelectTrigger className="h-9 bg-muted/40 border-border text-sm">
                    <SelectValue placeholder="Sub-category (optional)" />
                  </SelectTrigger>
                  <SelectContent className={selectContentClass}>
                    {subCategories.map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Description */}
      <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>
        <label className={labelClass}>Description</label>
        <Textarea
          className="mt-1 bg-muted/40 border-border text-sm min-h-[80px]"
          placeholder="What happened? What did you expect?"
          value={description}
          onChange={e => setDescription(e.target.value)}
        />
      </motion.div>

      {/* Steps to reproduce — conditional */}
      <AnimatePresence>
        {needsSeverity && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
          >
            <label className={labelClass}>Steps to reproduce</label>
            <Textarea
              className="mt-1 bg-muted/40 border-border text-sm min-h-[64px]"
              placeholder="1. Open schedule&#10;2. Click Step 3&#10;3. ..."
              value={steps}
              onChange={e => setSteps(e.target.value)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Screenshot */}
      <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.14 }}>
        <label className={labelClass}>Screenshot</label>
        <div className="mt-1">
          {capturingScreenshot ? (
            <div className="rounded-md border border-border overflow-hidden">
              <div className="h-24 bg-muted/50 flex flex-col items-center justify-center gap-2">
                <div className="h-12 w-12 rounded-full bg-muted/80 animate-pulse" />
                <p className="text-xs font-medium text-muted-foreground">Capturing...</p>
              </div>
              <div className="relative h-0.5 w-full overflow-hidden bg-muted/40">
                <span
                  className="absolute left-0 top-0 h-full w-1/3 min-w-[64px] bg-sky-500/70 rounded-full"
                  style={{ animation: 'rbip-progress-slide 1.2s ease-in-out infinite' }}
                />
              </div>
            </div>
          ) : screenshotDataUrl ? (
            <div className="relative rounded-md overflow-hidden border border-border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={screenshotDataUrl}
                alt="Screenshot preview"
                className="w-full object-cover max-h-36"
              />
            </div>
          ) : (
            <div className="h-24 rounded-md bg-muted/40 border border-border flex flex-col items-center justify-center gap-2 text-xs text-muted-foreground">
              <span>No screenshot captured</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleCaptureNow}
                disabled={capturingScreenshot}
                className="gap-1.5 text-xs"
              >
                {capturingScreenshot ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Camera className="h-3.5 w-3.5" />
                )}
                Capture now
              </Button>
            </div>
          )}

          {screenshotDataUrl && (
            <div className="flex flex-wrap gap-2 mt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleRetake}
                disabled={capturingScreenshot}
                className="gap-1.5 text-xs relative overflow-hidden"
              >
                {capturingScreenshot ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Capturing...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-3.5 w-3.5" />
                    Retake
                  </>
                )}
                {capturingScreenshot && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 overflow-hidden rounded-b-md">
                    <span
                      className="absolute left-0 top-0 h-full w-1/3 min-w-[32px] bg-sky-500/70 rounded-full"
                      style={{ animation: 'rbip-progress-slide 1.2s ease-in-out infinite' }}
                    />
                  </span>
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleCropRegion}
                disabled={capturingScreenshot || !fullPageDataUrl}
                className="gap-1.5 text-xs"
              >
                <Crop className="h-3.5 w-3.5" />
                Crop region
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleDiscardScreenshot}
                disabled={capturingScreenshot}
                className="gap-1.5 text-xs text-muted-foreground hover:text-destructive hover:border-destructive/50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Discard
              </Button>
            </div>
          )}
        </div>
      </motion.div>

      {/* Submit */}
      <div className={`flex items-center justify-between gap-3 pt-1 ${compact ? 'border-t border-border' : ''}`}>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-muted-foreground text-xs"
          onClick={() => setPhase('similar')}
        >
          ← Back
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={!canSubmit || submitting}
          onClick={handleSubmit}
          className="gap-1.5"
        >
          {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Submit report
        </Button>
      </div>
    </div>
  )
}
