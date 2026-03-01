'use client'

import { useCallback, useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Star,
  Trash2,
  ChevronDown,
  ChevronUp,
  Loader2,
  ThumbsUp,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_TYPE_LABELS,
  FEEDBACK_SEVERITY_LABELS,
  FEEDBACK_STATUS_LABELS,
  SEVERITY_STRIP_COLOR,
  STATUS_DOT_COLOR,
  getCategoryLabel,
  getSubCategoryLabel,
  type FeedbackType,
  type FeedbackSeverity,
  type FeedbackStatus,
} from '@/lib/feedback/categories'
import type { FeedbackReport } from '@/lib/feedback/types'
import { useAccessControl } from '@/lib/access/useAccessControl'
import { useRouter } from 'next/navigation'
import { useNavigationLoading } from '@/components/ui/navigation-loading'

// ─── Tiny helpers ──────────────────────────────────────────────────────────

/** Sentinel for Radix Select "All" option — empty string is reserved by Radix */
const ALL_FILTER = '__all__'

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

function ticketId(n: number): string {
  return `#FB-${n.toString().padStart(3, '0')}`
}

// ─── Sidebar filter ────────────────────────────────────────────────────────

interface Filters {
  status: FeedbackStatus | ''
  category: string
  type: FeedbackType | ''
  severity: FeedbackSeverity | ''
}

function FilterSidebar({
  filters,
  onChange,
  counts,
}: {
  filters: Filters
  onChange: (f: Filters) => void
  counts: Record<string, number>
}) {
  const labelClass = 'text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1 block'

  return (
    <aside className="w-48 flex-shrink-0 border-r border-border pr-5 flex flex-col gap-5">
      <div>
        <span className={labelClass}>Status</span>
        <div className="flex flex-col gap-0.5">
          {(['', 'new', 'in_review', 'in_progress', 'fixed', 'wont_fix', 'duplicate'] as const).map(s => (
            <button
              key={s}
              onClick={() => onChange({ ...filters, status: s })}
              className={`flex items-center justify-between w-full rounded px-2 py-1 text-xs text-left transition-colors ${
                filters.status === s
                  ? 'bg-muted text-foreground font-medium'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
            >
              <span>{s === '' ? 'All' : FEEDBACK_STATUS_LABELS[s as FeedbackStatus]}</span>
              {counts[s || 'all'] !== undefined && (
                <span className="text-[10px] text-muted-foreground">{counts[s || 'all']}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div>
        <span className={labelClass}>Type</span>
        <Select
          value={filters.type || ALL_FILTER}
          onValueChange={v => onChange({ ...filters, type: v === ALL_FILTER ? '' : (v as FeedbackType) })}
        >
          <SelectTrigger className="h-8 text-xs bg-muted/40 border-border">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_FILTER}>All types</SelectItem>
            {(Object.entries(FEEDBACK_TYPE_LABELS) as [FeedbackType, string][]).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <span className={labelClass}>Category</span>
        <Select
          value={filters.category || ALL_FILTER}
          onValueChange={v => onChange({ ...filters, category: v === ALL_FILTER ? '' : v })}
        >
          <SelectTrigger className="h-8 text-xs bg-muted/40 border-border">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_FILTER}>All categories</SelectItem>
            {FEEDBACK_CATEGORIES.map(c => (
              <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <span className={labelClass}>Severity</span>
        <Select
          value={filters.severity || ALL_FILTER}
          onValueChange={v => onChange({ ...filters, severity: v === ALL_FILTER ? '' : (v as FeedbackSeverity) })}
        >
          <SelectTrigger className="h-8 text-xs bg-muted/40 border-border">
            <SelectValue placeholder="All severities" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_FILTER}>All severities</SelectItem>
            {(Object.entries(FEEDBACK_SEVERITY_LABELS) as [FeedbackSeverity, string][]).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {(filters.status || filters.type || filters.category || filters.severity) ? (
        <button
          onClick={() => onChange({ status: '', type: '', category: '', severity: '' })}
          className="text-xs text-sky-600 hover:text-sky-700 transition-colors text-left"
        >
          Clear filters
        </button>
      ) : null}
    </aside>
  )
}

// ─── Report row ────────────────────────────────────────────────────────────

function ReportRow({
  report,
  selected,
  onClick,
}: {
  report: FeedbackReport
  selected: boolean
  onClick: () => void
}) {
  const stripColor = report.severity ? SEVERITY_STRIP_COLOR[report.severity] : 'bg-transparent'
  const dotColor = STATUS_DOT_COLOR[report.status]

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-start gap-3 px-2 py-4 text-left transition-colors group ${
        selected ? 'bg-muted/50' : 'hover:bg-muted/30'
      }`}
    >
      {/* Severity strip */}
      <div className={`w-1 self-stretch rounded-full flex-shrink-0 ${stripColor}`} />

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className={`text-sm leading-snug truncate ${selected ? 'font-semibold' : 'font-medium'}`}>
            {report.is_priority && <Star className="inline h-3 w-3 text-amber-400 mr-1 -mt-0.5" />}
            {report.title}
          </p>
          <span className="text-[10px] text-muted-foreground flex-shrink-0">{timeAgo(report.created_at)}</span>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          {getCategoryLabel(report.category)}
          {report.sub_category ? ` · ${getSubCategoryLabel(report.category, report.sub_category)}` : ''}
          {' · '}
          {FEEDBACK_TYPE_LABELS[report.type]}
        </p>
        <div className="flex items-center gap-3 mt-1.5">
          <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
            <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />
            {FEEDBACK_STATUS_LABELS[report.status]}
          </span>
          {report.upvote_count > 0 && (
            <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
              <ThumbsUp className="h-2.5 w-2.5" />
              {report.upvote_count}
            </span>
          )}
          <span className="text-[10px] text-muted-foreground font-mono">{ticketId(report.ticket_number)}</span>
        </div>
      </div>
    </button>
  )
}

// ─── Detail panel ──────────────────────────────────────────────────────────

function DetailPanel({
  report,
  onClose,
  onUpdate,
  onDelete,
}: {
  report: FeedbackReport
  onClose: () => void
  onUpdate: (updated: FeedbackReport) => void
  onDelete: (id: string) => void
}) {
  const [status, setStatus] = useState<FeedbackStatus>(report.status)
  const [isPriority, setIsPriority] = useState(report.is_priority)
  const [devNotes, setDevNotes] = useState(report.dev_notes ?? '')
  const [devReply, setDevReply] = useState(report.dev_reply ?? '')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [contextExpanded, setContextExpanded] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)

  const labelClass = 'text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1 block'

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/feedback', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: report.id,
          status,
          is_priority: isPriority,
          dev_notes: devNotes || null,
          dev_reply: devReply || null,
        }),
      })
      const data = await res.json()
      if (res.ok) onUpdate(data.report)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteConfirm) { setDeleteConfirm(true); return }
    setDeleting(true)
    try {
      const res = await fetch(`/api/feedback?id=${report.id}`, { method: 'DELETE' })
      if (res.ok) onDelete(report.id)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <motion.div
      className="flex flex-col h-full overflow-hidden"
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 8 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-border flex-shrink-0">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-muted-foreground">{ticketId(report.ticket_number)}</span>
            <button
              onClick={() => setIsPriority(v => !v)}
              className={`transition-colors ${isPriority ? 'text-amber-400' : 'text-muted-foreground hover:text-amber-400'}`}
              title={isPriority ? 'Remove priority' : 'Mark priority'}
            >
              <Star className="h-3.5 w-3.5" fill={isPriority ? 'currentColor' : 'none'} />
            </button>
          </div>
          <h2 className="text-sm font-semibold mt-0.5 leading-snug">{report.title}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {FEEDBACK_TYPE_LABELS[report.type]}
            {report.severity ? ` · ${FEEDBACK_SEVERITY_LABELS[report.severity]}` : ''}
            {' · '}
            {getCategoryLabel(report.category)}
            {report.sub_category ? ` / ${getSubCategoryLabel(report.category, report.sub_category)}` : ''}
          </p>
          <p className="text-xs text-muted-foreground">
            {report.submitter_name ?? 'Unknown'} · {timeAgo(report.created_at)}
            {report.upvote_count > 0 && ` · ${report.upvote_count} upvotes`}
          </p>
        </div>
        <button
          onClick={onClose}
          className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors flex-shrink-0"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-5 py-4 flex flex-col gap-5 divide-y divide-border">

          {/* Description */}
          <div>
            <span className={labelClass}>Description</span>
            <p className="text-sm text-foreground whitespace-pre-wrap">{report.description}</p>
          </div>

          {/* Steps to reproduce */}
          {report.steps_to_reproduce && (
            <div className="pt-4">
              <span className={labelClass}>Steps to reproduce</span>
              <p className="text-sm text-foreground whitespace-pre-wrap">{report.steps_to_reproduce}</p>
            </div>
          )}

          {/* Screenshot */}
          {report.screenshot_url && (
            <div className="pt-4">
              <span className={labelClass}>Screenshot</span>
              <div className="mt-1 rounded-md overflow-hidden border border-border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <a href={report.screenshot_url} target="_blank" rel="noopener noreferrer">
                  <img
                    src={report.screenshot_url}
                    alt="Screenshot"
                    className="w-full object-cover max-h-48 hover:opacity-90 transition-opacity"
                  />
                </a>
              </div>
            </div>
          )}

          {/* Auto-context */}
          {report.auto_context && Object.keys(report.auto_context).length > 0 && (
            <div className="pt-4">
              <button
                className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setContextExpanded(v => !v)}
              >
                {contextExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                Auto-context
              </button>
              <AnimatePresence>
                {contextExpanded && (
                  <motion.pre
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.18 }}
                    className="mt-2 text-[11px] font-mono bg-muted/40 rounded-md p-3 overflow-x-auto text-muted-foreground leading-relaxed"
                  >
                    {JSON.stringify(report.auto_context, null, 2)}
                  </motion.pre>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Status */}
          <div className="pt-4">
            <span className={labelClass}>Status</span>
            <Select value={status} onValueChange={v => setStatus(v as FeedbackStatus)}>
              <SelectTrigger className="h-9 bg-muted/40 border-border text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.entries(FEEDBACK_STATUS_LABELS) as [FeedbackStatus, string][]).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Dev notes (internal) */}
          <div className="pt-4">
            <span className={labelClass}>Dev notes</span>
            <p className="text-[10px] text-muted-foreground mb-1">Internal only — not visible to submitter</p>
            <Textarea
              className="bg-muted/40 border-border text-sm min-h-[64px]"
              placeholder="Internal notes..."
              value={devNotes}
              onChange={e => setDevNotes(e.target.value)}
            />
          </div>

          {/* Reply to submitter (optional) */}
          <div className="pt-4">
            <span className={labelClass}>Reply to submitter</span>
            <p className="text-[10px] text-muted-foreground mb-1">Optional — leave blank to just update status</p>
            <Textarea
              className="bg-muted/40 border-border text-sm min-h-[64px]"
              placeholder="Optional message shown to submitter..."
              value={devReply}
              onChange={e => setDevReply(e.target.value)}
            />
          </div>

        </div>
      </div>

      {/* Footer actions */}
      <div className="px-5 py-4 border-t border-border flex items-center justify-between flex-shrink-0">
        <Button
          variant="destructive"
          size="sm"
          onClick={handleDelete}
          disabled={deleting}
          className="gap-1.5 text-xs"
        >
          {deleting
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <Trash2 className="h-3.5 w-3.5" />
          }
          {deleteConfirm ? 'Confirm delete' : 'Delete'}
        </Button>

        <Button
          size="sm"
          onClick={handleSave}
          disabled={saving}
          className="gap-1.5"
        >
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Save changes
        </Button>
      </div>
    </motion.div>
  )
}

// ─── Main page ─────────────────────────────────────────────────────────────

export default function FeedbackReviewPage() {
  const [reports, setReports] = useState<FeedbackReport[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [filters, setFilters] = useState<Filters>({ status: '', type: '', category: '', severity: '' })

  const access = useAccessControl()
  const router = useRouter()
  const navLoading = useNavigationLoading()

  // Gate: developer only
  useEffect(() => {
    if (access.status === 'ready' && access.role !== 'developer') {
      navLoading.start('/feedback')
      router.replace('/feedback')
    }
  }, [access.status, access.role, router, navLoading])

  const loadReports = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ mode: 'review' })
      if (filters.status) params.set('status', filters.status)
      if (filters.category) params.set('category', filters.category)
      if (filters.type) params.set('type', filters.type)
      if (filters.severity) params.set('severity', filters.severity)

      const res = await fetch(`/api/feedback?${params}`)
      const data = await res.json()
      setReports(data.reports ?? [])
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => {
    loadReports()
  }, [loadReports])

  const selectedReport = reports.find(r => r.id === selectedId) ?? null

  // Status counts for sidebar
  const counts: Record<string, number> = { all: reports.length }
  for (const r of reports) {
    counts[r.status] = (counts[r.status] ?? 0) + 1
  }

  const handleUpdate = (updated: FeedbackReport) => {
    setReports(prev => prev.map(r => r.id === updated.id ? updated : r))
  }

  const handleDelete = (id: string) => {
    setReports(prev => prev.filter(r => r.id !== id))
    setSelectedId(null)
  }

  return (
    <div className="flex h-[calc(100vh-57px)] overflow-hidden">

      {/* ── Sidebar filter ── */}
      <div className="flex-shrink-0 w-56 border-r border-border px-5 py-6 overflow-y-auto">
        <p className="text-xs font-semibold text-muted-foreground mb-4">Filter</p>
        <FilterSidebar filters={filters} onChange={f => { setFilters(f); setSelectedId(null) }} counts={counts} />
      </div>

      {/* ── Report list ── */}
      <div className={`flex flex-col border-r border-border overflow-hidden transition-all duration-300 ${selectedReport ? 'w-[360px] flex-shrink-0' : 'flex-1'}`}>

        {/* List header */}
        <div className="px-5 py-4 border-b border-border flex-shrink-0">
          <h1 className="text-base font-bold">Feedback & Issues</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {loading ? 'Loading...' : `${reports.length} report${reports.length !== 1 ? 's' : ''}`}
          </p>
        </div>

        {/* List body */}
        <div className="flex-1 overflow-y-auto divide-y divide-border">
          {loading ? (
            <div className="py-12 flex justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : reports.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No reports match this filter.</p>
          ) : (
            reports.map((report, i) => (
              <motion.div
                key={report.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.02 }}
              >
                <ReportRow
                  report={report}
                  selected={report.id === selectedId}
                  onClick={() => setSelectedId(report.id === selectedId ? null : report.id)}
                />
              </motion.div>
            ))
          )}
        </div>
      </div>

      {/* ── Detail panel ── */}
      <AnimatePresence>
        {selectedReport && (
          <div className="flex-1 overflow-hidden">
            <DetailPanel
              key={selectedReport.id}
              report={selectedReport}
              onClose={() => setSelectedId(null)}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
            />
          </div>
        )}
      </AnimatePresence>

    </div>
  )
}
