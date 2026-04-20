'use client'

import { Team } from '@/types/staff'
import {
  BedAllocation,
  BedRelievingNoteRow,
  BedRelievingNotesByToTeam,
  BedRelievingNotesForToTeam,
  BedRelievingTransferNote,
} from '@/types/schedule'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip } from '@/components/ui/tooltip'
import { useOnClickOutside } from '@/lib/hooks/useOnClickOutside'
import { cn } from '@/lib/utils'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Check, Info, Pencil, Plus, X, XCircle } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import * as React from 'react'
import {
  formatBedCountLabel,
  getTransferDisplayMode,
  isBedRelievingTransferDone,
  normalizeBedRelievingTransferEntry,
} from '@/lib/features/schedule/bedRelievingTransferState'

const EMPTY_NOTES_FOR_TO_TEAM: BedRelievingNotesForToTeam = {}

interface BedBlockProps {
  team: Team
  allocations: BedAllocation[]
  wards?: { name: string; team_assignments: Record<Team, number> }[]
  bedRelievingNotesByToTeam?: BedRelievingNotesByToTeam
  onSaveBedRelievingNotesForToTeam?: (
    toTeam: Team,
    notes: BedRelievingNotesForToTeam
  ) => void
  activeEditingTransfer?: { fromTeam: Team; toTeam: Team } | null
  onActiveEditingTransferChange?: (next: { fromTeam: Team; toTeam: Team } | null) => void
  currentStep?: string
  onInvalidEditAttempt?: (position: { x: number; y: number }) => void
}

/** Split on commas and/or whitespace; each non-empty token is one bed (numeric or e.g. CB3). */
function parseBedNumberTokens(text: string): string[] {
  return text
    .split(/[\s,]+/g)
    .map((t) => t.trim())
    .filter(Boolean)
}

function countBedNumbers(text: string): number {
  return parseBedNumberTokens(text).length
}

/** Numeric tokens sorted numerically, then non-numeric tokens sorted lexicographically; joined as ", ". */
function canonicalizeBedNumbersText(text: string): string {
  const tokens = parseBedNumberTokens(text)
  if (tokens.length === 0) return ''
  const numeric: string[] = []
  const nonNumeric: string[] = []
  for (const t of tokens) {
    if (/^\d+$/.test(t)) numeric.push(t)
    else nonNumeric.push(t)
  }
  numeric.sort((a, b) => Number(a) - Number(b))
  nonNumeric.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true }))
  return [...numeric, ...nonNumeric].join(', ')
}

function formatBedNumbersForDisplay(text: string): string {
  return canonicalizeBedNumbersText(text)
}

export const BedBlock = React.memo(function BedBlock({
  team,
  allocations,
  wards,
  bedRelievingNotesByToTeam,
  onSaveBedRelievingNotesForToTeam,
  activeEditingTransfer,
  onActiveEditingTransferChange,
  currentStep,
  onInvalidEditAttempt,
}: BedBlockProps) {
  const cardRef = React.useRef<HTMLDivElement | null>(null)
  const receiving = React.useMemo(
    () => allocations.filter(a => a.to_team === team),
    [allocations, team]
  )
  const releasing = React.useMemo(
    () => allocations.filter(a => a.from_team === team),
    [allocations, team]
  )

  const existingNotesForToTeam =
    bedRelievingNotesByToTeam?.[team] ?? EMPTY_NOTES_FOR_TO_TEAM
  const hasSavedTakesState = Object.keys(existingNotesForToTeam as any).length > 0

  const [isEditingTakes, setIsEditingTakes] = React.useState(false)
  const [editingFromTeam, setEditingFromTeam] = React.useState<Team | null>(null)
  const [draftByFromTeam, setDraftByFromTeam] = React.useState<
    Partial<Record<Team, Required<BedRelievingTransferNote>>>
  >({})
  const focusTargetRef = React.useRef<{ type: 'ward' | 'beds'; key: string } | null>(null)
  const pendingBedsFocusAfterSelectCloseRef = React.useRef<string | null>(null)
  const rowRefs = React.useRef(
    new Map<
      string,
      {
        wardTrigger?: HTMLButtonElement | null
        bedsTextarea?: HTMLTextAreaElement | null
      }
    >()
  )

  // Group expected beds by releasing team for this taking team
  const expectedBedsFromTeam: Partial<Record<Team, number>> = React.useMemo(() => {
    const out: Partial<Record<Team, number>> = {}
    receiving.forEach(a => {
      const from = a.from_team
      out[from] = (out[from] ?? 0) + a.num_beds
    })
    return out
  }, [receiving])

  const receivingFromTeams = React.useMemo(() => {
    const set = new Set<Team>()
    receiving.forEach(a => set.add(a.from_team))
    return Array.from(set)
  }, [receiving])

  const canEdit = currentStep === 'bed-relieving'

  // When exiting edit mode, re-align this block into a "top-center / center" viewport position
  // so the user can immediately review the Takes/Releases summary.
  const wasEditingRef = React.useRef(false)
  React.useEffect(() => {
    const wasEditing = wasEditingRef.current
    wasEditingRef.current = isEditingTakes
    if (!wasEditing || isEditingTakes) return
    const el = cardRef.current
    if (!el) return
    // Double RAF to ensure layout is settled after closing editor UI.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        try {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        } catch {
          // ignore
        }
      })
    })
  }, [isEditingTakes])

  const reportInvalidEdit = React.useCallback(
    (e: React.MouseEvent) => {
      if (!onInvalidEditAttempt) return
      // Use cursor position so the warning appears next to the click.
      const x = e.clientX
      const y = e.clientY
      onInvalidEditAttempt({ x, y })
    },
    [onInvalidEditAttempt]
  )

  const openEditAll = React.useCallback(() => {
    if (!onSaveBedRelievingNotesForToTeam) return
    const next: Partial<Record<Team, Required<BedRelievingTransferNote>>> = {}
    let focusKey: string | null = null
    let focusType: 'ward' | 'beds' = 'ward'
    for (const fromTeam of receivingFromTeams) {
      const existing = normalizeBedRelievingTransferEntry((existingNotesForToTeam as any)?.[fromTeam])
      const seedRows =
        existing.rows.length > 0
          ? existing.rows.map((row) => ({ ward: row.ward || '', bedNumbersText: row.bedNumbersText || '' }))
          : [{ ward: '', bedNumbersText: '' }]
      next[fromTeam] = {
        resolution: existing.resolution,
        rows: seedRows,
      }
      if (!focusKey) {
        const firstRow = seedRows[0]
        focusKey = `${fromTeam}:0`
        focusType = (firstRow.ward || '').trim().length === 0 ? 'ward' : 'beds'
      }
    }
    // Preserve any existing notes for fromTeams not present in the current algorithm allocations
    Object.entries(existingNotesForToTeam as any).forEach(([k, rows]) => {
      const fromTeam = k as Team
      if (next[fromTeam]) return
      const normalized = normalizeBedRelievingTransferEntry(rows as any)
      if (normalized.rows.length > 0 || normalized.resolution === 'not-released') {
        next[fromTeam] = normalized
      }
    })
    setEditingFromTeam(null)
    setDraftByFromTeam(next)
    if (focusKey) {
      focusTargetRef.current = { type: focusType, key: focusKey }
    }
    setIsEditingTakes(true)
  }, [existingNotesForToTeam, onSaveBedRelievingNotesForToTeam, receivingFromTeams])

  const openEditFromTeam = React.useCallback(
    (fromTeam: Team) => {
      if (!onSaveBedRelievingNotesForToTeam) return
      const existing = normalizeBedRelievingTransferEntry((existingNotesForToTeam as any)?.[fromTeam])
      const rows =
        existing.rows.length > 0
          ? existing.rows.map((row) => ({ ward: row.ward || '', bedNumbersText: row.bedNumbersText || '' }))
          : [{ ward: '', bedNumbersText: '' }]
      setEditingFromTeam(fromTeam)
      setDraftByFromTeam({
        [fromTeam]: {
          resolution: existing.resolution,
          rows,
        },
      })
      const firstRow = rows[0]
      focusTargetRef.current = {
        type: (firstRow.ward || '').trim().length === 0 ? 'ward' : 'beds',
        key: `${fromTeam}:0`,
      }
      setIsEditingTakes(true)
    },
    [existingNotesForToTeam, onSaveBedRelievingNotesForToTeam]
  )

  // Auto-focus: if ward not chosen, focus ward; else focus bed numbers.
  React.useLayoutEffect(() => {
    if (!isEditingTakes) {
      focusTargetRef.current = null
      return
    }
    const target = focusTargetRef.current
    if (!target) return

    // Retry for a few frames because refs may not be attached yet
    // (and Radix Select can briefly steal focus during close).
    let cancelled = false
    let attempts = 0
    const maxAttempts = 10

    const tick = () => {
      if (cancelled) return
      const refEntry = rowRefs.current.get(target.key)
      const el = target.type === 'ward' ? refEntry?.wardTrigger : refEntry?.bedsTextarea
      if (el) {
        focusTargetRef.current = null
        try {
          el.focus()
          el.scrollIntoView({ block: 'nearest' })
        } catch {
          // ignore
        }
        return
      }
      attempts += 1
      if (attempts < maxAttempts) requestAnimationFrame(tick)
    }

    requestAnimationFrame(tick)
    return () => {
      cancelled = true
    }
  }, [isEditingTakes, draftByFromTeam, editingFromTeam])

  const takesSummaryForTooltip = React.useMemo(() => {
    if (receiving.length === 0) return 'Takes: (none)'
    const parts = receivingFromTeams.map(fromTeam => {
      const n = expectedBedsFromTeam[fromTeam] ?? 0
      return `${formatBedCountLabel(n)} from ${fromTeam}`
    })
    return `Takes: ${parts.join(', ')}`
  }, [receiving.length, receivingFromTeams, expectedBedsFromTeam])

  const releasesSummaryForTooltip = React.useMemo(() => {
    if (releasing.length === 0) return 'Releases: (none)'
    const byTo: Partial<Record<Team, number>> = {}
    releasing.forEach(a => {
      byTo[a.to_team] = (byTo[a.to_team] ?? 0) + a.num_beds
    })
    const parts = Object.entries(byTo).map(([toTeam, n]) => `${formatBedCountLabel(n)} to ${toTeam}`)
    return `Releases: ${parts.join(', ')}`
  }, [releasing])

  // Outgoing completion: if counterparty (toTeam) has ANY bed numbers entered for this releasing team, mark done.
  const outgoingToTeams = React.useMemo(() => {
    const set = new Set<Team>()
    releasing.forEach(a => set.add(a.to_team))
    return Array.from(set)
  }, [releasing])

  const outgoingDoneByToTeam = React.useMemo(() => {
    const out: Partial<Record<Team, boolean>> = {}
    outgoingToTeams.forEach(toTeam => {
      const entry = bedRelievingNotesByToTeam?.[toTeam]?.[team]
      const expectedOutgoingBeds = releasing
        .filter((allocation) => allocation.to_team === toTeam)
        .reduce((sum, allocation) => sum + allocation.num_beds, 0)
      out[toTeam] = isBedRelievingTransferDone(entry, expectedOutgoingBeds)
    })
    return out
  }, [outgoingToTeams, bedRelievingNotesByToTeam, team, releasing])

  const shouldHideReleases =
    releasing.length > 0 && outgoingToTeams.every(t => outgoingDoneByToTeam[t])

  const showNoAllocation = receiving.length === 0 && releasing.length === 0

  const wardOptionsForFromTeam = React.useCallback(
    (fromTeam: Team): string[] => {
      if (!wards || wards.length === 0) return []
      const names = wards
        .filter(w => (w.team_assignments as any)?.[fromTeam] > 0)
        .map(w => w.name)
      return Array.from(new Set(names)).sort()
    },
    [wards]
  )

  const handleSave = () => {
    if (!onSaveBedRelievingNotesForToTeam) {
      setIsEditingTakes(false)
      return
    }

    const cleaned: BedRelievingNotesForToTeam = {}
    Object.entries(draftByFromTeam as any).forEach(([k, value]) => {
      const fromTeam = k as Team
      const normalized = normalizeBedRelievingTransferEntry(value as any)
      if (normalized.resolution === 'not-released') {
        cleaned[fromTeam] = {
          resolution: 'not-released',
          rows: [],
        }
        return
      }
      const kept = normalized.rows.filter(r => {
        const ward = (r.ward || '').trim()
        const beds = (r.bedNumbersText || '').trim()
        return ward.length > 0 || beds.length > 0
      })
      if (kept.length > 0) {
        cleaned[fromTeam] = {
          resolution: 'taken',
          rows: kept,
        }
      }
    })

    // Merge into existing notes (so editing a single team doesn't wipe others)
    const merged: BedRelievingNotesForToTeam = { ...(existingNotesForToTeam as any) }
    Object.keys(draftByFromTeam as any).forEach(k => {
      const fromTeam = k as Team
      const nextEntry = cleaned[fromTeam]
      if (!nextEntry) {
        delete (merged as any)[fromTeam]
      } else {
        ;(merged as any)[fromTeam] = nextEntry
      }
    })

    onSaveBedRelievingNotesForToTeam(team, merged)
    setIsEditingTakes(false)
    setEditingFromTeam(null)
    setDraftByFromTeam({})
    onActiveEditingTransferChange?.(null)
  }

  // UX: click outside the taking-team card → auto "save" (into schedule state) + exit edit mode.
  // Important: ignore clicks inside Radix Select portals (ward dropdown) so choosing options
  // doesn't immediately close+save.
  useOnClickOutside(
    cardRef,
    (event) => {
      if (!isEditingTakes) return
      const target = (event.target ?? null) as unknown
      if (target && target instanceof Element) {
        // Radix Select content renders in a portal (outside the card), but should be treated as "inside".
        if (target.closest('[data-radix-popper-content-wrapper]')) return
        if (target.closest('[role="listbox"]')) return
      }
      handleSave()
    },
    { enabled: isEditingTakes && canEdit, event: 'pointerdown' }
  )

  const handleCancel = () => {
    setIsEditingTakes(false)
    setDraftByFromTeam({})
    setEditingFromTeam(null)
    onActiveEditingTransferChange?.(null)
  }

  const renderTakesDisplay = () => {
    const allFromTeamsInDisplay: Team[] = Array.from(
      new Set<Team>([
        ...receivingFromTeams,
        ...Object.keys(existingNotesForToTeam as any).map(k => k as Team),
      ])
    )

    const doneFromTeams = allFromTeamsInDisplay.filter((fromTeam) => {
      return isBedRelievingTransferDone(
        (existingNotesForToTeam as any)?.[fromTeam],
        expectedBedsFromTeam[fromTeam] ?? 0
      )
    })
    const shownDoneFromTeams = doneFromTeams.filter((fromTeam) => {
      const visible =
        getTransferDisplayMode(
          (existingNotesForToTeam as any)?.[fromTeam],
          expectedBedsFromTeam[fromTeam] ?? 0
        ) === 'shown'
      const normalized = normalizeBedRelievingTransferEntry((existingNotesForToTeam as any)?.[fromTeam])
      return visible && normalized.rows.length > 0
    })

    // "Pending" means: expected by algorithm for this taking team, but no saved bed numbers yet.
    const pendingFromTeams = receivingFromTeams.filter(
      (fromTeam) => !doneFromTeams.includes(fromTeam)
    )

    if (shownDoneFromTeams.length === 0 && pendingFromTeams.length === 0) return null

    return (
      <div className="space-y-1">
        {shownDoneFromTeams.map((fromTeam) => {
          const normalized = normalizeBedRelievingTransferEntry((existingNotesForToTeam as any)?.[fromTeam])
          const r = normalized.rows
          return (
            <div key={`notes-${fromTeam}`} className="group space-y-1">
              {r.map((row, idx) => (
                <div
                  key={`row-${fromTeam}-${idx}`}
                  className="grid grid-cols-[1fr_auto] gap-2 text-xs items-start"
                >
                  <div className="text-left font-medium">
                    {fromTeam}
                    {row.ward ? ` (${row.ward})` : ''}
                  </div>
                  <div className="flex items-start justify-end gap-1 text-muted-foreground">
                    <span className="text-right">{formatBedNumbersForDisplay(row.bedNumbersText || '')}</span>
                    {onSaveBedRelievingNotesForToTeam && idx === 0 ? (
                      <Tooltip side="top" content={`Edit ${fromTeam}`}>
                        <span className="inline-flex">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-4 w-4 p-0 opacity-0 group-hover:opacity-100"
                            onClick={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              if (!canEdit) {
                                reportInvalidEdit(e)
                                return
                              }
                              openEditFromTeam(fromTeam)
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        </span>
                      </Tooltip>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )
        })}

        {shownDoneFromTeams.length > 0 && pendingFromTeams.length > 0 ? (
          <div className="border-t border-border/60 my-1" />
        ) : null}

        {pendingFromTeams.map((fromTeam) => (
          <div key={`pending-${fromTeam}`} className="text-xs text-muted-foreground">
            {formatBedCountLabel(expectedBedsFromTeam[fromTeam] ?? 0)} from {fromTeam}
          </div>
        ))}
      </div>
    )
  }

  const renderTakesEditor = () => {
    const allEditableFromTeams: Team[] = Array.from(
      new Set<Team>([
        ...receivingFromTeams,
        ...Object.keys(existingNotesForToTeam as any).map((key) => key as Team),
      ])
    )
    const doneFromTeams = allEditableFromTeams.filter(ft => {
      return isBedRelievingTransferDone(
        (existingNotesForToTeam as any)?.[ft],
        expectedBedsFromTeam[ft] ?? 0
      )
    })
    const hiddenDoneFromTeams = doneFromTeams.filter((ft) => {
      return getTransferDisplayMode(
        (existingNotesForToTeam as any)?.[ft],
        expectedBedsFromTeam[ft] ?? 0
      ) === 'hidden'
    })
    const savedOnlyFromTeams = allEditableFromTeams.filter((ft) => !receivingFromTeams.includes(ft))
    const pendingFromTeams = receivingFromTeams.filter(ft => !doneFromTeams.includes(ft))
    const fromTeamsToEdit = editingFromTeam
      ? [editingFromTeam]
      : Array.from(new Set<Team>([...pendingFromTeams, ...hiddenDoneFromTeams, ...savedOnlyFromTeams]))

    return (
      <div className="space-y-1">
        {/* Completed inputs shown on top in display mode */}
        {!editingFromTeam && doneFromTeams.length > 0 ? (
          <div className="space-y-1">
            {doneFromTeams.map(ft => {
              const normalized = normalizeBedRelievingTransferEntry((existingNotesForToTeam as any)?.[ft])
              if (normalized.resolution === 'not-released') return null
              const rows = normalized.rows
              if (!rows || rows.length === 0) return null
              return (
                <div key={`done-${ft}`} className="group space-y-1">
                  {rows.map((row, idx) => (
                    <div key={`done-${ft}-${idx}`} className="grid grid-cols-[1fr_auto] gap-2 text-xs items-start">
                      <div className="font-medium">
                        {ft}
                        {row.ward ? ` (${row.ward})` : ''}
                      </div>
                      <div className="flex items-start justify-end gap-1 text-muted-foreground">
                        <span className="text-right">{formatBedNumbersForDisplay(row.bedNumbersText || '')}</span>
                        {idx === 0 ? (
                          <Tooltip side="top" content={`Edit ${ft}`}>
                            <span className="inline-flex">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-4 w-4 p-0 opacity-0 group-hover:opacity-100"
                                onClick={(e) => {
                                  e.preventDefault()
                                  e.stopPropagation()
                                  if (!canEdit) {
                                    reportInvalidEdit(e)
                                    return
                                  }
                                  openEditFromTeam(ft)
                                }}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            </span>
                          </Tooltip>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        ) : null}

        {fromTeamsToEdit.map(fromTeam => {
          const transfer = draftByFromTeam[fromTeam] ?? {
            resolution: 'taken' as const,
            rows: [{ ward: '', bedNumbersText: '' }],
          }
          const rows = transfer.rows
          const expected = expectedBedsFromTeam[fromTeam] ?? 0
          const typedCount = rows.reduce((sum, r) => sum + countBedNumbers(r.bedNumbersText || ''), 0)
          const showWarn =
            transfer.resolution !== 'not-released' &&
            typedCount > 0 &&
            expected > 0 &&
            typedCount !== expected
          const wardOptions = wardOptionsForFromTeam(fromTeam)
          const canMarkNotReleased = expected === 1

          return (
            <div key={`edit-${fromTeam}`} className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[11px] font-semibold">{fromTeam}</div>
                {canMarkNotReleased ? (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-muted-foreground">
                      {transfer.resolution === 'taken' ? 'To take' : 'Not released'}
                    </span>
                    <Switch
                      checked={transfer.resolution === 'taken'}
                      onCheckedChange={(checked) => {
                        setDraftByFromTeam((prev) => ({
                          ...(prev as any),
                          [fromTeam]: checked
                            ? {
                                resolution: 'taken',
                                rows:
                                  ((prev as any)?.[fromTeam]?.rows as BedRelievingNoteRow[] | undefined)?.length
                                    ? ([...(prev as any)[fromTeam].rows] as BedRelievingNoteRow[])
                                    : [{ ward: '', bedNumbersText: '' }],
                              }
                            : {
                                resolution: 'not-released',
                                rows: [],
                              },
                        }))
                      }}
                      className="h-4 w-7 data-[state=checked]:bg-emerald-600"
                      aria-label={transfer.resolution === 'taken' ? 'To take' : 'Not released'}
                    />
                  </div>
                ) : null}
              </div>

              {transfer.resolution === 'not-released' ? (
                <div className="text-xs text-muted-foreground italic">
                  Marked as not released. This transfer stays hidden in display mode and can be changed here later.
                </div>
              ) : rows.map((row, idx) => (
                <div key={`row-${fromTeam}-${idx}`} className="space-y-1">
                  <div className="grid grid-cols-[1fr_auto_auto] gap-2 items-center">
                    {wardOptions.length > 0 ? (
                      <Select
                        value={row.ward ? row.ward : undefined}
                        onValueChange={(value) => {
                          const key = `${fromTeam}:${idx}`
                          // After choosing a ward, auto-focus the corresponding bed-number textarea.
                          focusTargetRef.current = { type: 'beds', key }
                          pendingBedsFocusAfterSelectCloseRef.current = key
                          setDraftByFromTeam(prev => {
                            const next = { ...(prev as any) }
                            const arr = ([...(((next[fromTeam]?.rows as BedRelievingNoteRow[]) || []))] as BedRelievingNoteRow[]).map((r, i) =>
                              i === idx ? { ...r, ward: value } : r
                            )
                            next[fromTeam] = { resolution: 'taken', rows: arr }
                            return next
                          })
                        }}
                      >
                        <SelectTrigger
                          className="h-7 px-2 text-xs w-20"
                          ref={(el) => {
                            const key = `${fromTeam}:${idx}`
                            const entry = rowRefs.current.get(key) || {}
                            entry.wardTrigger = el
                            rowRefs.current.set(key, entry)
                          }}
                        >
                          <SelectValue placeholder="Ward" />
                        </SelectTrigger>
                        <SelectContent
                          onCloseAutoFocus={(e) => {
                            // Radix Select will (by default) move focus back to the trigger AFTER this callback.
                            // That can steal focus from the beds textarea. Prevent default and keep focus where we want it.
                            const key = `${fromTeam}:${idx}`
                            if (pendingBedsFocusAfterSelectCloseRef.current === key) {
                              e.preventDefault()
                              pendingBedsFocusAfterSelectCloseRef.current = null
                              requestAnimationFrame(() => {
                                rowRefs.current.get(key)?.bedsTextarea?.focus()
                              })
                            }
                          }}
                        >
                          {wardOptions.map(w => (
                            <SelectItem key={`${fromTeam}-${w}`} value={w} className="text-xs py-1">
                              {w}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        className="h-7 px-2 text-xs w-20"
                        placeholder="Ward"
                        value={row.ward || ''}
                        onChange={(e) => {
                          const value = e.target.value
                          setDraftByFromTeam(prev => {
                            const next = { ...(prev as any) }
                            const arr = ([...(((next[fromTeam]?.rows as BedRelievingNoteRow[]) || []))] as BedRelievingNoteRow[]).map((r, i) =>
                              i === idx ? { ...r, ward: value } : r
                            )
                            next[fromTeam] = { resolution: 'taken', rows: arr }
                            return next
                          })
                        }}
                      />
                    )}

                    <Tooltip content="Add bed row">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 p-0"
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          setDraftByFromTeam((prev) => ({
                            ...(prev as any),
                            [fromTeam]: {
                              resolution: 'taken',
                              rows: [
                                ...((((prev as any)?.[fromTeam]?.rows as BedRelievingNoteRow[]) || [])),
                                { ward: '', bedNumbersText: '' },
                              ],
                            },
                          }))
                        }}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </Tooltip>

                    <Tooltip content="Remove bed row">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 p-0"
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          setDraftByFromTeam(prev => {
                            const next = { ...(prev as any) }
                            const arr = ([...(((next[fromTeam]?.rows as BedRelievingNoteRow[]) || []))] as BedRelievingNoteRow[]).filter(
                              (_, i) => i !== idx
                            )
                            next[fromTeam] = {
                              resolution: 'taken',
                              rows: arr.length > 0 ? arr : [{ ward: '', bedNumbersText: '' }],
                            }
                            return next
                          })
                        }}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </Tooltip>
                  </div>

                  <Textarea
                    rows={(row.bedNumbersText || '').trim().length === 0 ? 3 : 1}
                    className={
                      (row.bedNumbersText || '').trim().length === 0
                        ? 'min-h-[72px] text-xs resize-none whitespace-pre-wrap break-keep [overflow-wrap:normal]'
                        : 'min-h-0 text-xs resize-none whitespace-pre-wrap break-keep [overflow-wrap:normal]'
                    }
                    placeholder="Bed numbers to take (e.g. 19, 20, CB3)"
                    value={row.bedNumbersText || ''}
                    onFocus={() => {
                      onActiveEditingTransferChange?.({ fromTeam, toTeam: team })
                    }}
                    ref={(el) => {
                      const key = `${fromTeam}:${idx}`
                      const entry = rowRefs.current.get(key) || {}
                      entry.bedsTextarea = el
                      rowRefs.current.set(key, entry)
                    }}
                    onChange={(e) => {
                      const value = e.target.value
                      // auto-resize
                      e.currentTarget.style.height = '0px'
                      e.currentTarget.style.height = `${e.currentTarget.scrollHeight}px`
                      setDraftByFromTeam(prev => {
                        const next = { ...(prev as any) }
                        const arr = ([...(((next[fromTeam]?.rows as BedRelievingNoteRow[]) || []))] as BedRelievingNoteRow[]).map((r, i) =>
                          i === idx ? { ...r, bedNumbersText: value } : r
                        )
                        next[fromTeam] = { resolution: 'taken', rows: arr }
                        return next
                      })
                    }}
                    onBlur={(e) => {
                      const canonical = canonicalizeBedNumbersText(e.target.value)
                      if (canonical === (row.bedNumbersText || '')) return
                      setDraftByFromTeam((prev) => {
                        const next = { ...(prev as any) }
                        const arr = ([...(((next[fromTeam]?.rows as BedRelievingNoteRow[]) || []))] as BedRelievingNoteRow[]).map((r, i) =>
                          i === idx ? { ...r, bedNumbersText: canonical } : r
                        )
                        next[fromTeam] = { resolution: 'taken', rows: arr }
                        return next
                      })
                    }}
                  />
                </div>
              ))}

              {showWarn ? (
                <div className="text-[11px] text-amber-600">
                  Expected {formatBedCountLabel(expected)}, you entered {formatBedCountLabel(typedCount)}
                </div>
              ) : null}
            </div>
          )
        })}

        <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
          <Tooltip side="top" content="Cancel editing (discard unsaved changes)">
            <span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 p-0"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  handleCancel()
                }}
              >
                <XCircle className="h-5 w-5" />
              </Button>
            </span>
          </Tooltip>
          <Tooltip side="top" content="Confirm">
            <span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 p-0"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  handleSave()
                }}
              >
                <Check className="h-5 w-5" />
              </Button>
            </span>
          </Tooltip>
        </div>
      </div>
    )
  }

  return (
    <Card ref={cardRef} data-tour="bed-relieving">
      <CardContent className="p-2 pt-1">
        <div className="space-y-1">
          {(receiving.length > 0 || hasSavedTakesState) && (
            <div>
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="flex items-center gap-1">
                  <p className="text-xs font-semibold text-green-600">Takes:</p>
                  {isEditingTakes ? (
                    <Tooltip content={takesSummaryForTooltip} side="top">
                      <span className="inline-flex items-center">
                        <Info className="h-3.5 w-3.5 text-muted-foreground" />
                      </span>
                    </Tooltip>
                  ) : null}
                </div>
                {!isEditingTakes && onSaveBedRelievingNotesForToTeam ? (
                <Tooltip side="top" content="Edit takes for all releasing teams">
                    <span>
                      <Button
                        type="button"
                        variant={canEdit ? 'secondary' : 'outline'}
                        size="sm"
                        className="h-7 px-2 text-xs font-semibold rounded-full"
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          if (!canEdit) {
                            reportInvalidEdit(e)
                            return
                          }
                          openEditAll()
                        }}
                      >
                        Edit
                      </Button>
                    </span>
                  </Tooltip>
                ) : null}
              </div>

              <div
                className={onSaveBedRelievingNotesForToTeam ? 'cursor-text' : undefined}
                onClick={(e) => {
                  if (isEditingTakes) return
                  if (!canEdit) {
                    reportInvalidEdit(e)
                    return
                  }
                  openEditAll()
                }}
              >
                {isEditingTakes ? renderTakesEditor() : renderTakesDisplay()}
              </div>
            </div>
          )}
          {releasing.length > 0 && !shouldHideReleases && (
            <div>
              <div className="flex items-center gap-1 mb-1">
                <p className="text-xs font-semibold text-red-600">Releases:</p>
                {isEditingTakes ? (
                  <Tooltip content={releasesSummaryForTooltip} side="top">
                    <span className="inline-flex items-center">
                      <Info className="h-3.5 w-3.5 text-muted-foreground" />
                    </span>
                  </Tooltip>
                ) : null}
              </div>
              {releasing.map((allocation) => {
                const done = outgoingDoneByToTeam[allocation.to_team] === true
                const isActiveHighlight =
                  !!activeEditingTransfer &&
                  activeEditingTransfer.fromTeam === team &&
                  activeEditingTransfer.toTeam === allocation.to_team
                return (
                  <div
                    key={allocation.id}
                    className={done ? 'text-xs text-muted-foreground' : 'text-xs'}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={cn(
                          'transition-[box-shadow,background-color] duration-200 rounded-sm px-1 -mx-1',
                          isActiveHighlight && isEditingTakes
                            ? 'bg-amber-100/70 shadow-[0_0_0_2px_rgba(251,191,36,0.55),0_0_16px_rgba(251,191,36,0.35)]'
                            : isActiveHighlight
                              ? 'bg-amber-100/70 shadow-[0_0_0_2px_rgba(251,191,36,0.55),0_0_16px_rgba(251,191,36,0.35)]'
                              : ''
                        )}
                      >
                        {formatBedCountLabel(allocation.num_beds)} to {allocation.to_team}
                      </span>
                      {done ? <Check className="h-3.5 w-3.5 text-muted-foreground" /> : null}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          {showNoAllocation && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No bed allocation
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
})

