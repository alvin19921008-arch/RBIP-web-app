'use client'

import { Team } from '@/types/staff'
import { BedAllocation, BedRelievingNoteRow, BedRelievingNotesByToTeam } from '@/types/schedule'
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
import { Check, Info, Pencil, Plus, Trash2, X, XCircle } from 'lucide-react'
import * as React from 'react'

const EMPTY_NOTES_FOR_TO_TEAM: Partial<Record<Team, BedRelievingNoteRow[]>> = {}

interface BedBlockProps {
  team: Team
  allocations: BedAllocation[]
  wards?: { name: string; team_assignments: Record<Team, number> }[]
  bedRelievingNotesByToTeam?: BedRelievingNotesByToTeam
  onSaveBedRelievingNotesForToTeam?: (
    toTeam: Team,
    notes: Partial<Record<Team, BedRelievingNoteRow[]>>
  ) => void
  activeEditingTransfer?: { fromTeam: Team; toTeam: Team } | null
  onActiveEditingTransferChange?: (next: { fromTeam: Team; toTeam: Team } | null) => void
  currentStep?: string
  onInvalidEditAttempt?: (position: { x: number; y: number }) => void
}

function countBedNumbers(text: string): number {
  return text
    .split(/[\s,]+/g)
    .map(t => t.trim())
    .filter(Boolean)
    .filter(t => /^\d+$/.test(t)).length
}

function hasAnyBedNumbers(rows: BedRelievingNoteRow[] | undefined): boolean {
  return (rows || []).some(r => (r.bedNumbersText || '').trim().length > 0)
}

function formatBedNumbersForDisplay(text: string): string {
  const matches = text.match(/\d+/g)
  if (!matches) return text.trim()
  const nums = matches.map(n => parseInt(n, 10)).filter(n => Number.isFinite(n))
  nums.sort((a, b) => a - b)
  return nums.map(n => String(n)).join(', ')
}

export function BedBlock({
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

  const [isEditingTakes, setIsEditingTakes] = React.useState(false)
  const [editingFromTeam, setEditingFromTeam] = React.useState<Team | null>(null)
  const [draftByFromTeam, setDraftByFromTeam] = React.useState<
    Partial<Record<Team, BedRelievingNoteRow[]>>
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
    const next: Partial<Record<Team, BedRelievingNoteRow[]>> = {}
    let focusKey: string | null = null
    let focusType: 'ward' | 'beds' = 'ward'
    for (const fromTeam of receivingFromTeams) {
      const existing = (existingNotesForToTeam as any)?.[fromTeam] as BedRelievingNoteRow[] | undefined
      const seedRows =
        existing && existing.length > 0
          ? existing.map(r => ({ ward: r.ward || '', bedNumbersText: r.bedNumbersText || '' }))
          : [{ ward: '', bedNumbersText: '' }]
      if (existing && existing.length > 0) {
        next[fromTeam] = seedRows
      } else {
        next[fromTeam] = seedRows
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
      const r = (rows as BedRelievingNoteRow[]) || []
      if (r.length > 0) next[fromTeam] = r
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
      const existing = (existingNotesForToTeam as any)?.[fromTeam] as BedRelievingNoteRow[] | undefined
      const rows =
        existing && existing.length > 0
          ? existing.map(r => ({ ward: r.ward || '', bedNumbersText: r.bedNumbersText || '' }))
          : [{ ward: '', bedNumbersText: '' }]
      setEditingFromTeam(fromTeam)
      setDraftByFromTeam({ [fromTeam]: rows })
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
      return `${n} beds from ${fromTeam}`
    })
    return `Takes: ${parts.join(', ')}`
  }, [receiving.length, receivingFromTeams, expectedBedsFromTeam])

  const releasesSummaryForTooltip = React.useMemo(() => {
    if (releasing.length === 0) return 'Releases: (none)'
    const byTo: Partial<Record<Team, number>> = {}
    releasing.forEach(a => {
      byTo[a.to_team] = (byTo[a.to_team] ?? 0) + a.num_beds
    })
    const parts = Object.entries(byTo).map(([toTeam, n]) => `${n} beds to ${toTeam}`)
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
      const rows = bedRelievingNotesByToTeam?.[toTeam]?.[team]
      out[toTeam] = hasAnyBedNumbers(rows)
    })
    return out
  }, [outgoingToTeams, bedRelievingNotesByToTeam, team])

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

    const cleaned: Partial<Record<Team, BedRelievingNoteRow[]>> = {}
    Object.entries(draftByFromTeam as any).forEach(([k, rows]) => {
      const fromTeam = k as Team
      const kept = (rows as BedRelievingNoteRow[]).filter(r => {
        const ward = (r.ward || '').trim()
        const beds = (r.bedNumbersText || '').trim()
        return ward.length > 0 || beds.length > 0
      })
      if (kept.length > 0) cleaned[fromTeam] = kept
    })

    // Merge into existing notes (so editing a single team doesn't wipe others)
    const merged: Partial<Record<Team, BedRelievingNoteRow[]>> = { ...(existingNotesForToTeam as any) }
    Object.keys(draftByFromTeam as any).forEach(k => {
      const fromTeam = k as Team
      const nextRows = cleaned[fromTeam]
      if (!nextRows || nextRows.length === 0) {
        delete (merged as any)[fromTeam]
      } else {
        ;(merged as any)[fromTeam] = nextRows
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

  const handleClear = () => {
    if (onSaveBedRelievingNotesForToTeam) {
      onSaveBedRelievingNotesForToTeam(team, {})
    }
    setIsEditingTakes(false)
    setDraftByFromTeam({})
    setEditingFromTeam(null)
    onActiveEditingTransferChange?.(null)
  }

  const renderTakesDisplay = () => {
    const hasAnyNotes = Object.values(existingNotesForToTeam as any).some((rows: any) =>
      (rows || []).some((r: any) => (r?.ward || '').trim() || (r?.bedNumbersText || '').trim())
    )

    if (!hasAnyNotes) {
      // Show one line per releasing team (aggregated), consistent with the edit UI.
      return receivingFromTeams.map((fromTeam) => (
        <div key={`pending-${fromTeam}`} className="text-xs">
          {expectedBedsFromTeam[fromTeam] ?? 0} beds from {fromTeam}
        </div>
      ))
    }

    const allFromTeamsInDisplay: Team[] = Array.from(
      new Set<Team>([
        ...receivingFromTeams,
        ...Object.keys(existingNotesForToTeam as any).map(k => k as Team),
      ])
    )

    const doneFromTeams = allFromTeamsInDisplay.filter((fromTeam) => {
      const r = ((existingNotesForToTeam as any)?.[fromTeam] as BedRelievingNoteRow[]) || []
      return r.length > 0
    })

    // "Pending" means: expected by algorithm for this taking team, but no saved bed numbers yet.
    const pendingFromTeams = receivingFromTeams.filter(
      (fromTeam) => !doneFromTeams.includes(fromTeam)
    )

    return (
      <div className="space-y-1">
        {doneFromTeams.map((fromTeam) => {
          const r = ((existingNotesForToTeam as any)?.[fromTeam] as BedRelievingNoteRow[]) || []
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

        {doneFromTeams.length > 0 && pendingFromTeams.length > 0 ? (
          <div className="border-t border-border/60 my-1" />
        ) : null}

        {pendingFromTeams.map((fromTeam) => (
          <div key={`pending-${fromTeam}`} className="text-xs text-muted-foreground">
            {expectedBedsFromTeam[fromTeam] ?? 0} beds from {fromTeam}
          </div>
        ))}
      </div>
    )
  }

  const renderTakesEditor = () => {
    const doneFromTeams = receivingFromTeams.filter(ft => {
      const rows = (existingNotesForToTeam as any)?.[ft] as BedRelievingNoteRow[] | undefined
      return rows && rows.some(r => (r.ward || '').trim() || (r.bedNumbersText || '').trim())
    })
    const pendingFromTeams = receivingFromTeams.filter(ft => !doneFromTeams.includes(ft))
    const fromTeamsToEdit = editingFromTeam ? [editingFromTeam] : pendingFromTeams

    return (
      <div className="space-y-1">
        {/* Completed inputs shown on top in display mode */}
        {!editingFromTeam && doneFromTeams.length > 0 ? (
          <div className="space-y-1">
            {doneFromTeams.map(ft => {
              const rows = (existingNotesForToTeam as any)?.[ft] as BedRelievingNoteRow[] | undefined
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
          const rows = (draftByFromTeam[fromTeam] || []) as BedRelievingNoteRow[]
          const expected = expectedBedsFromTeam[fromTeam] ?? 0
          const typedCount = rows.reduce((sum, r) => sum + countBedNumbers(r.bedNumbersText || ''), 0)
          const showWarn = typedCount > 0 && expected > 0 && typedCount !== expected
          const wardOptions = wardOptionsForFromTeam(fromTeam)

          return (
            <div key={`edit-${fromTeam}`} className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[11px] font-semibold">{fromTeam}</div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    setDraftByFromTeam(prev => ({
                      ...(prev as any),
                      [fromTeam]: [
                        ...(((prev as any)?.[fromTeam] as BedRelievingNoteRow[]) || []),
                        { ward: '', bedNumbersText: '' },
                      ],
                    }))
                  }}
                  title="Add row"
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>

              {rows.map((row, idx) => (
                <div key={`row-${fromTeam}-${idx}`} className="space-y-1">
                  <div className="grid grid-cols-[1fr_auto] gap-2 items-center">
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
                            const arr = ([...(next[fromTeam] || [])] as BedRelievingNoteRow[]).map((r, i) =>
                              i === idx ? { ...r, ward: value } : r
                            )
                            next[fromTeam] = arr
                            return next
                          })
                        }}
                      >
                        <SelectTrigger
                          className="h-7 px-2 text-xs"
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
                        className="h-7 px-2 text-xs"
                        placeholder="Ward (e.g. R9C)"
                        value={row.ward || ''}
                        onChange={(e) => {
                          const value = e.target.value
                          setDraftByFromTeam(prev => {
                            const next = { ...(prev as any) }
                            const arr = ([...(next[fromTeam] || [])] as BedRelievingNoteRow[]).map((r, i) =>
                              i === idx ? { ...r, ward: value } : r
                            )
                            next[fromTeam] = arr
                            return next
                          })
                        }}
                      />
                    )}

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        setDraftByFromTeam(prev => {
                          const next = { ...(prev as any) }
                          const arr = ([...(next[fromTeam] || [])] as BedRelievingNoteRow[]).filter(
                            (_, i) => i !== idx
                          )
                          next[fromTeam] = arr.length > 0 ? arr : [{ ward: '', bedNumbersText: '' }]
                          return next
                        })
                      }}
                      title="Remove row"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  <Textarea
                    rows={(row.bedNumbersText || '').trim().length === 0 ? 3 : 1}
                    className={
                      (row.bedNumbersText || '').trim().length === 0
                        ? 'min-h-[72px] text-xs resize-none whitespace-pre-wrap break-keep [overflow-wrap:normal]'
                        : 'min-h-0 text-xs resize-none whitespace-pre-wrap break-keep [overflow-wrap:normal]'
                    }
                    placeholder="Bed numbers to take (e.g. 19, 20)"
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
                        const arr = ([...(next[fromTeam] || [])] as BedRelievingNoteRow[]).map((r, i) =>
                          i === idx ? { ...r, bedNumbersText: value } : r
                        )
                        next[fromTeam] = arr
                        return next
                      })
                    }}
                  />
                </div>
              ))}

              {showWarn ? (
                <div className="text-[11px] text-amber-600">
                  Expected {expected} beds, you entered {typedCount}
                </div>
              ) : null}
            </div>
          )
        })}

        <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
          {onSaveBedRelievingNotesForToTeam ? (
            <Tooltip
              side="top"
              content={
                editingFromTeam
                  ? `Clear all inputs for ${editingFromTeam} (only in this team's Takes box).`
                  : "Clear all saved bed-number inputs in this team's Takes box."
              }
            >
              <span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 p-0"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    if (editingFromTeam) {
                      // Clear only the currently edited releasing team (safer for re-edit).
                      const merged: Partial<Record<Team, BedRelievingNoteRow[]>> = {
                        ...(existingNotesForToTeam as any),
                      }
                      delete (merged as any)[editingFromTeam]
                      onSaveBedRelievingNotesForToTeam(team, merged)
                      setIsEditingTakes(false)
                      setEditingFromTeam(null)
                      setDraftByFromTeam({})
                      return
                    }
                    handleClear()
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </span>
            </Tooltip>
          ) : null}
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
          <Tooltip side="top" content="Save">
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
    <Card ref={cardRef}>
      <CardContent className="p-2 pt-1">
        <div className="space-y-1">
          {receiving.length > 0 && (
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
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
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
                        {allocation.num_beds} beds to {allocation.to_team}
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
}

