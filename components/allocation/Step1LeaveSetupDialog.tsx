'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { formatTimeRange, getSlotTime } from '@/lib/utils/slotHelpers'
import { isOnDutyLeaveType } from '@/lib/utils/leaveType'
import { SpecialProgram, SPTAllocation } from '@/types/allocation'
import { LEAVE_TYPE_FTE_MAP, LeaveType, Staff, Weekday } from '@/types/staff'
import { Plus, RotateCcw, Search, X } from 'lucide-react'
import { getTeamBadgeClass } from '@/components/allocation/teamThemePalette'
import { TimeIntervalSlider } from '@/components/allocation/TimeIntervalSlider'

type StaffOverrideLite = {
  leaveType?: LeaveType | null
  fteRemaining?: number
  fteSubtraction?: number
  availableSlots?: number[]
  invalidSlots?: Array<{ slot: number; timeRange: { start: string; end: string } }>
  amPmSelection?: 'AM' | 'PM'
  specialProgramAvailable?: boolean
}

type Step1SaveEdit = {
  staffId: string
  leaveType: LeaveType | null
  fteRemaining: number
  fteSubtraction?: number
  availableSlots?: number[]
  invalidSlots?: Array<{ slot: number; timeRange: { start: string; end: string } }>
  amPmSelection?: 'AM' | 'PM'
  specialProgramAvailable?: boolean
}

interface Step1LeaveSetupDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  staff: Staff[]
  staffOverrides: Record<string, StaffOverrideLite>
  specialPrograms: SpecialProgram[]
  sptAllocations: SPTAllocation[]
  weekday: Weekday
  onSaveDraft: (args: { edits: Step1SaveEdit[] }) => void | Promise<void>
}

type WizardStep = '1.1' | '1.2' | '1.3' | '1.4'

type PredefinedLeaveType =
  | 'VL'
  | 'half day VL'
  | 'TIL'
  | 'half day TIL'
  | 'SDO'
  | 'sick leave'
  | 'study leave'
  | 'medical follow-up'
  | 'others'

type LeaveChoice = '__none__' | PredefinedLeaveType

type InvalidSlotDraft = { slot: number; timeRange: { start: string; end: string } }

type DraftRow = {
  staffId: string
  leaveChoice: LeaveChoice
  customLeaveText: string
  fteRemaining: number
  fteSubtraction: number
  sptBaseFTE: number
  availableSlots: number[]
  invalidSlots: InvalidSlotDraft[]
  amPmSelection: 'AM' | 'PM' | ''
  specialProgramAvailable: boolean
  selected: boolean
}

const LEAVE_CHOICES: PredefinedLeaveType[] = [
  'VL',
  'half day VL',
  'TIL',
  'half day TIL',
  'SDO',
  'sick leave',
  'study leave',
  'medical follow-up',
  'others',
]

const SLOT_OPTIONS: Array<1 | 2 | 3 | 4> = [1, 2, 3, 4]

const THERAPIST_RANKS = new Set(['SPT', 'APPT', 'RPT'])

const RANK_ORDER: Record<string, number> = {
  SPT: 0,
  APPT: 1,
  RPT: 2,
  PCA: 3,
  workman: 4,
}

const RANK_BADGE_NEUTRAL_CLASS =
  'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900/30 dark:text-slate-200'

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

function normalizeSlots(slots: number[] | undefined): number[] {
  if (!Array.isArray(slots)) return []
  return Array.from(new Set(slots.filter((slot) => SLOT_OPTIONS.includes(slot as 1 | 2 | 3 | 4)))).sort((a, b) => a - b)
}

function defaultSlotsFromCapacity(capacity: number): number[] {
  const slotCount = clamp(Math.round(capacity / 0.25), 0, 4)
  return SLOT_OPTIONS.slice(0, slotCount)
}

function isPredefinedLeaveType(value: string): value is PredefinedLeaveType {
  return LEAVE_CHOICES.includes(value as PredefinedLeaveType)
}

function slotDefaultRange(slot: number): { start: string; end: string } {
  const formatted = formatTimeRange(getSlotTime(slot))
  const [start, end] = formatted.split('-')
  return {
    start: (start || '0900').slice(0, 4),
    end: (end || '1030').slice(0, 4),
  }
}

function normalizeHHMM(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 4)
  if (digits.length < 4) return digits.padEnd(4, '0')
  return digits
}

function isValidRange(range: { start: string; end: string }): boolean {
  const start = normalizeHHMM(range.start)
  const end = normalizeHHMM(range.end)
  if (!/^\d{4}$/.test(start) || !/^\d{4}$/.test(end)) return false
  return Number(start) < Number(end)
}

export function Step1LeaveSetupDialog({
  open,
  onOpenChange,
  staff,
  staffOverrides,
  specialPrograms,
  sptAllocations,
  weekday,
  onSaveDraft,
}: Step1LeaveSetupDialogProps) {
  const [wizardStep, setWizardStep] = useState<WizardStep>('1.1')
  const [quickFind, setQuickFind] = useState('')
  const [quickFindOpen, setQuickFindOpen] = useState(false)
  const quickFindInputRef = useRef<HTMLInputElement | null>(null)
  const quickFindButtonRef = useRef<HTMLButtonElement | null>(null)
  const [rows, setRows] = useState<DraftRow[]>([])
  const [initialRows, setInitialRows] = useState<DraftRow[]>([])
  const [customEditingById, setCustomEditingById] = useState<Record<string, boolean>>({})
  const [saving, setSaving] = useState(false)
  const [bulkLeaveTherapist, setBulkLeaveTherapist] = useState<LeaveChoice>('__none__')
  const [bulkLeavePca, setBulkLeavePca] = useState<LeaveChoice>('__none__')
  const [saveError, setSaveError] = useState<string | null>(null)

  const activeStaff = useMemo(
    () => staff.filter((member) => member.status !== 'inactive'),
    [staff]
  )

  const staffById = useMemo(() => {
    const map = new Map<string, Staff>()
    activeStaff.forEach((member) => map.set(member.id, member))
    return map
  }, [activeStaff])

  const sptBaseFteByStaffId = useMemo(() => {
    const map = new Map<string, number>()
    sptAllocations.forEach((allocation) => {
      const cfg = allocation.config_by_weekday?.[weekday]
      let base: number | null = null
      if (cfg) {
        if (cfg.enabled === false || cfg.contributes_fte === false) {
          base = 0
        } else if (Array.isArray(cfg.slots) && cfg.slots.length > 0) {
          base = cfg.slots.length * 0.25
        }
      }
      if (base == null) {
        const hasLegacyDay = Array.isArray(allocation.weekdays) && allocation.weekdays.includes(weekday)
        if (hasLegacyDay && typeof allocation.fte_addon === 'number') {
          base = allocation.fte_addon
        }
      }
      if (base != null && Number.isFinite(base)) {
        map.set(allocation.staff_id, clamp(base, 0, 1))
      }
    })
    return map
  }, [sptAllocations, weekday])

  const getCapacity = (member: Staff, sptBase: number): number => {
    if (member.rank === 'SPT') return clamp(sptBase, 0, 1)
    if (typeof member.buffer_fte === 'number' && member.status === 'buffer') {
      return clamp(member.buffer_fte, 0, 1)
    }
    return 1
  }

  const hasSpecialProgramForToday = (staffId: string): boolean => {
    return specialPrograms.some((program) => {
      if (program.name === 'DRO') return false
      if (!program.weekdays.includes(weekday)) return false
      return program.staff_ids.includes(staffId)
    })
  }

  const buildDraftRow = (member: Staff, sourceOverride: StaffOverrideLite | undefined): DraftRow => {
    const sptBaseFromConfig = member.rank === 'SPT' ? sptBaseFteByStaffId.get(member.id) ?? 0 : 1
    const baseCapacity = getCapacity(member, sptBaseFromConfig)
    const rawRemaining =
      typeof sourceOverride?.fteRemaining === 'number'
        ? sourceOverride.fteRemaining
        : baseCapacity
    const clampedRemaining = clamp(round2(rawRemaining), 0, baseCapacity)
    const rawSubtraction =
      typeof sourceOverride?.fteSubtraction === 'number'
        ? sourceOverride.fteSubtraction
        : baseCapacity - clampedRemaining
    const clampedSubtraction = clamp(round2(rawSubtraction), 0, baseCapacity)
    const sptBase =
      member.rank === 'SPT'
        ? clamp(round2(clampedRemaining + clampedSubtraction), 0, 1)
        : 1

    const rawLeaveType = sourceOverride?.leaveType
    let leaveChoice: LeaveChoice = '__none__'
    let customLeaveText = ''
    if (!isOnDutyLeaveType(rawLeaveType)) {
      if (typeof rawLeaveType === 'string' && isPredefinedLeaveType(rawLeaveType)) {
        leaveChoice = rawLeaveType
      } else {
        leaveChoice = 'others'
        customLeaveText = typeof rawLeaveType === 'string' ? rawLeaveType : ''
      }
    }

    const pcaLike = member.rank === 'PCA' || member.rank === 'workman'
    const normalizedSlots = normalizeSlots(sourceOverride?.availableSlots)
    const availableSlots = pcaLike
      ? (normalizedSlots.length > 0 ? normalizedSlots : defaultSlotsFromCapacity(clampedRemaining))
      : []

    const invalidSlots = pcaLike
      ? (Array.isArray(sourceOverride?.invalidSlots)
          ? sourceOverride.invalidSlots
              .filter((entry) => SLOT_OPTIONS.includes(entry.slot as 1 | 2 | 3 | 4))
              .map((entry) => ({
                slot: entry.slot,
                timeRange: {
                  start: normalizeHHMM(entry.timeRange.start),
                  end: normalizeHHMM(entry.timeRange.end),
                },
              }))
          : [])
      : []

    return {
      staffId: member.id,
      leaveChoice,
      customLeaveText,
      fteRemaining: clampedRemaining,
      fteSubtraction: clampedSubtraction,
      sptBaseFTE: sptBase,
      availableSlots,
      invalidSlots,
      amPmSelection: sourceOverride?.amPmSelection ?? '',
      specialProgramAvailable: sourceOverride?.specialProgramAvailable === true,
      selected: false,
    }
  }

  const hasStep1OverrideData = (member: Staff, override: StaffOverrideLite | undefined): boolean => {
    if (!override || typeof override !== 'object') return false
    if (isOnDutyLeaveType(override.leaveType)) return false
    const sptBase = member.rank === 'SPT' ? sptBaseFteByStaffId.get(member.id) ?? 0 : 1
    const capacity = getCapacity(member, sptBase)
    if (typeof override.fteRemaining === 'number' && Math.abs(override.fteRemaining - capacity) > 0.0001) return true
    if (typeof override.fteSubtraction === 'number' && override.fteSubtraction > 0.0001) return true
    if (Array.isArray(override.invalidSlots) && override.invalidSlots.length > 0) return true
    if (override.amPmSelection === 'AM' || override.amPmSelection === 'PM') return true
    if (override.specialProgramAvailable === true) return true
    if (member.rank === 'PCA' || member.rank === 'workman') {
      const defaultSlots = defaultSlotsFromCapacity(capacity)
      const currentSlots = normalizeSlots(override.availableSlots)
      if (JSON.stringify(defaultSlots) !== JSON.stringify(currentSlots)) return true
    }
    return false
  }

  useEffect(() => {
    if (!open) return
    const sortedStaff = [...activeStaff].sort((a, b) => {
      const rankOrder = (RANK_ORDER[a.rank] ?? 99) - (RANK_ORDER[b.rank] ?? 99)
      if (rankOrder !== 0) return rankOrder
      return a.name.localeCompare(b.name)
    })
    const autoRows = sortedStaff
      .filter((member) => hasStep1OverrideData(member, staffOverrides[member.id]))
      .map((member) => buildDraftRow(member, staffOverrides[member.id]))
    setRows(autoRows)
    setInitialRows(autoRows)
    setWizardStep('1.1')
    setQuickFind('')
    setQuickFindOpen(false)
    setCustomEditingById({})
    setSaveError(null)
    setBulkLeaveTherapist('__none__')
    setBulkLeavePca('__none__')
  }, [open, activeStaff, staffOverrides, sptBaseFteByStaffId])

  const initialComparable = useMemo(() => {
    const map = new Map<string, string>()
    initialRows.forEach((row) => {
      const member = staffById.get(row.staffId)
      if (!member) return
      const edit = rowToFinalEdit(row, member)
      map.set(row.staffId, JSON.stringify(edit))
    })
    return map
  }, [initialRows, staffById])

  const currentComparable = useMemo(() => {
    const map = new Map<string, string>()
    rows.forEach((row) => {
      const member = staffById.get(row.staffId)
      if (!member) return
      const edit = rowToFinalEdit(row, member)
      map.set(row.staffId, JSON.stringify(edit))
    })
    return map
  }, [rows, staffById])

  const isDraftDirty = useMemo(() => {
    if (rows.length !== initialRows.length) return true
    if (rows.some((row) => !initialComparable.has(row.staffId))) return true
    for (const [staffId, comparable] of currentComparable.entries()) {
      if (initialComparable.get(staffId) !== comparable) return true
    }
    return false
  }, [rows, initialRows.length, currentComparable, initialComparable])

  const therapistRows = useMemo(
    () =>
      rows
        .filter((row) => {
          const member = staffById.get(row.staffId)
          return !!member && THERAPIST_RANKS.has(member.rank)
        })
        .sort((a, b) => {
          const memberA = staffById.get(a.staffId)
          const memberB = staffById.get(b.staffId)
          if (!memberA || !memberB) return 0
          const rankOrder = (RANK_ORDER[memberA.rank] ?? 99) - (RANK_ORDER[memberB.rank] ?? 99)
          if (rankOrder !== 0) return rankOrder
          return memberA.name.localeCompare(memberB.name)
        }),
    [rows, staffById]
  )

  const sptRows = therapistRows.filter((row) => staffById.get(row.staffId)?.rank === 'SPT')
  const apptRows = therapistRows.filter((row) => staffById.get(row.staffId)?.rank === 'APPT')
  const rptRows = therapistRows.filter((row) => staffById.get(row.staffId)?.rank === 'RPT')

  const pcaRows = useMemo(
    () =>
      rows.filter((row) => {
        const member = staffById.get(row.staffId)
        return !!member && (member.rank === 'PCA' || member.rank === 'workman')
      }),
    [rows, staffById]
  )

  const floatingPcaRows = pcaRows
    .filter((row) => staffById.get(row.staffId)?.floating)
    .sort((a, b) => (staffById.get(a.staffId)?.name || '').localeCompare(staffById.get(b.staffId)?.name || ''))
  const nonFloatingPcaRows = pcaRows
    .filter((row) => !staffById.get(row.staffId)?.floating)
    .sort((a, b) => (staffById.get(a.staffId)?.name || '').localeCompare(staffById.get(b.staffId)?.name || ''))

  const rowIds = new Set(rows.map((row) => row.staffId))

  const filteredPickers = useMemo(() => {
    const query = quickFind.trim().toLowerCase()
    const filtered = activeStaff.filter((member) =>
      query.length === 0 ? true : member.name.toLowerCase().includes(query)
    )
    const byRank = {
      SPT: [] as Staff[],
      APPT: [] as Staff[],
      RPT: [] as Staff[],
      PCA: [] as Staff[],
    }
    filtered
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((member) => {
        if (member.rank === 'SPT') byRank.SPT.push(member)
        if (member.rank === 'APPT') byRank.APPT.push(member)
        if (member.rank === 'RPT') byRank.RPT.push(member)
        if (member.rank === 'PCA' || member.rank === 'workman') byRank.PCA.push(member)
      })
    return byRank
  }, [activeStaff, quickFind])

  const changedEdits = useMemo(() => {
    const edits: Step1SaveEdit[] = []
    const initialRowMap = new Map(initialRows.map((row) => [row.staffId, row]))
    const currentRowMap = new Map(rows.map((row) => [row.staffId, row]))

    rows.forEach((row) => {
      const member = staffById.get(row.staffId)
      if (!member) return
      const current = rowToFinalEdit(row, member)
      const initialRow = initialRowMap.get(row.staffId)
      if (!initialRow) {
        const defaultEdit = buildDefaultEdit(member, sptBaseFteByStaffId.get(member.id) ?? 0)
        if (JSON.stringify(current) !== JSON.stringify(defaultEdit)) edits.push(current)
        return
      }
      const initialEdit = rowToFinalEdit(initialRow, member)
      if (JSON.stringify(current) !== JSON.stringify(initialEdit)) edits.push(current)
    })

    initialRows.forEach((row) => {
      if (currentRowMap.has(row.staffId)) return
      const member = staffById.get(row.staffId)
      if (!member) return
      const initialEdit = rowToFinalEdit(row, member)
      const defaultEdit = buildDefaultEdit(member, sptBaseFteByStaffId.get(member.id) ?? 0)
      if (JSON.stringify(initialEdit) !== JSON.stringify(defaultEdit)) edits.push(defaultEdit)
    })

    return edits
  }, [rows, initialRows, staffById, sptBaseFteByStaffId])

  function rowToFinalEdit(row: DraftRow, member: Staff): Step1SaveEdit {
    const capacity = getCapacity(member, row.sptBaseFTE)
    const pcaLike = member.rank === 'PCA' || member.rank === 'workman'
    const finalLeaveType =
      row.leaveChoice === '__none__'
        ? null
        : row.leaveChoice === 'others'
          ? (row.customLeaveText.trim() || 'others')
          : row.leaveChoice

    const availableSlots = pcaLike ? normalizeSlots(row.availableSlots) : undefined
    const fteRemaining = pcaLike
      ? clamp(round2((availableSlots?.length ?? 0) * 0.25), 0, capacity)
      : clamp(round2(row.fteRemaining), 0, capacity)
    const fteSubtraction = member.rank === 'SPT'
      ? clamp(round2(row.fteSubtraction), 0, row.sptBaseFTE)
      : clamp(round2(capacity - fteRemaining), 0, capacity)
    const invalidSlots = pcaLike
      ? (row.invalidSlots
          .filter((entry) => !availableSlots?.includes(entry.slot))
          .map((entry) => ({
            slot: entry.slot,
            timeRange: {
              start: normalizeHHMM(entry.timeRange.start),
              end: normalizeHHMM(entry.timeRange.end),
            },
          }))
          .filter((entry) => isValidRange(entry.timeRange)))
      : undefined
    const showAmPm = (member.rank === 'APPT' || member.rank === 'RPT') && (fteRemaining === 0.25 || fteRemaining === 0.5)

    return {
      staffId: member.id,
      leaveType: finalLeaveType,
      fteRemaining,
      fteSubtraction,
      availableSlots,
      invalidSlots,
      amPmSelection: showAmPm && row.amPmSelection ? row.amPmSelection : undefined,
      specialProgramAvailable: THERAPIST_RANKS.has(member.rank) && hasSpecialProgramForToday(member.id)
        ? row.specialProgramAvailable
        : undefined,
    }
  }

  function buildDefaultEdit(member: Staff, sptBaseFromConfig: number): Step1SaveEdit {
    const capacity = getCapacity(member, sptBaseFromConfig)
    const pcaLike = member.rank === 'PCA' || member.rank === 'workman'
    return {
      staffId: member.id,
      leaveType: null,
      fteRemaining: capacity,
      fteSubtraction: 0,
      availableSlots: pcaLike ? defaultSlotsFromCapacity(capacity) : undefined,
      invalidSlots: undefined,
      amPmSelection: undefined,
      specialProgramAvailable: undefined,
    }
  }

  const setRow = (staffId: string, updater: (row: DraftRow, member: Staff) => DraftRow) => {
    setRows((prev) =>
      prev.map((row) => {
        if (row.staffId !== staffId) return row
        const member = staffById.get(staffId)
        if (!member) return row
        return updater(row, member)
      })
    )
  }

  const addRow = (member: Staff) => {
    if (rowIds.has(member.id)) return
    const next = buildDraftRow(member, staffOverrides[member.id])
    setRows((prev) => [...prev, next])
  }

  const removeRow = (staffId: string) => {
    setRows((prev) => prev.filter((row) => row.staffId !== staffId))
  }

  const clearSelectedRows = (target: 'therapist' | 'pca') => {
    setRows((prev) =>
      prev.map((row) => {
        const member = staffById.get(row.staffId)
        if (!member || !row.selected) return row
        const isTherapist = THERAPIST_RANKS.has(member.rank)
        if ((target === 'therapist' && !isTherapist) || (target === 'pca' && isTherapist)) return row
        const defaultEdit = buildDefaultEdit(member, member.rank === 'SPT' ? (sptBaseFteByStaffId.get(member.id) ?? 0) : 1)
        return {
          ...row,
          leaveChoice: '__none__',
          customLeaveText: '',
          fteRemaining: defaultEdit.fteRemaining,
          fteSubtraction: defaultEdit.fteSubtraction ?? 0,
          availableSlots: defaultEdit.availableSlots ?? [],
          invalidSlots: [],
          amPmSelection: '',
          specialProgramAvailable: false,
        }
      })
    )
  }

  const applyBulkLeaveChoice = (target: 'therapist' | 'pca', leaveChoice: LeaveChoice) => {
    setRows((prev) =>
      prev.map((row) => {
        const member = staffById.get(row.staffId)
        if (!member || !row.selected) return row
        const isTherapist = THERAPIST_RANKS.has(member.rank)
        if ((target === 'therapist' && !isTherapist) || (target === 'pca' && isTherapist)) return row
        const capacity = getCapacity(member, row.sptBaseFTE)
        const next: DraftRow = {
          ...row,
          leaveChoice,
          customLeaveText: leaveChoice === 'others' ? row.customLeaveText : '',
        }

        if (leaveChoice === '__none__') {
          next.fteRemaining = capacity
          next.fteSubtraction = 0
          if (member.rank === 'PCA' || member.rank === 'workman') {
            next.availableSlots = defaultSlotsFromCapacity(capacity)
            next.invalidSlots = []
          }
          next.amPmSelection = ''
          next.specialProgramAvailable = false
          return next
        }

        if (leaveChoice !== 'others') {
          const mapped = LEAVE_TYPE_FTE_MAP[leaveChoice as keyof typeof LEAVE_TYPE_FTE_MAP]
          if (typeof mapped === 'number') {
            const remain = clamp(round2(mapped), 0, capacity)
            next.fteRemaining = remain
            next.fteSubtraction = clamp(round2(capacity - remain), 0, capacity)
            if (member.rank === 'PCA' || member.rank === 'workman') {
              next.availableSlots = defaultSlotsFromCapacity(remain)
              next.invalidSlots = []
            }
          }
        }
        return next
      })
    )
  }

  const resetDraft = () => {
    setRows(initialRows.map((row) => ({ ...row, selected: false })))
    setCustomEditingById({})
    setSaveError(null)
  }

  const selectedTherapistCount = therapistRows.filter((row) => row.selected).length
  const selectedPcaCount = pcaRows.filter((row) => row.selected).length

  const toggleRowSelected = (staffId: string, checked: boolean) => {
    setRows((prev) => prev.map((row) => (row.staffId === staffId ? { ...row, selected: checked } : row)))
  }

  const setSectionSelected = (sectionRows: DraftRow[], checked: boolean) => {
    const ids = new Set(sectionRows.map((row) => row.staffId))
    setRows((prev) => prev.map((row) => (ids.has(row.staffId) ? { ...row, selected: checked } : row)))
  }

  const handleSave = async () => {
    setSaveError(null)
    const invalidRangeRows = rows.filter((row) => {
      const member = staffById.get(row.staffId)
      if (!member) return false
      if (member.rank !== 'PCA' && member.rank !== 'workman') return false
      return row.invalidSlots.some((entry) => !isValidRange(entry.timeRange))
    })
    if (invalidRangeRows.length > 0) {
      setSaveError('Please fix invalid time ranges before saving.')
      return
    }

    setSaving(true)
    try {
      await onSaveDraft({ edits: changedEdits })
      onOpenChange(false)
    } catch (error) {
      console.error('Failed to save Step 1 leave setup:', error)
      setSaveError('Unable to save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const nextStep = () => {
    if (wizardStep === '1.1') setWizardStep('1.2')
    else if (wizardStep === '1.2') setWizardStep('1.3')
    else if (wizardStep === '1.3') setWizardStep('1.4')
  }

  const prevStep = () => {
    if (wizardStep === '1.4') setWizardStep('1.3')
    else if (wizardStep === '1.3') setWizardStep('1.2')
    else if (wizardStep === '1.2') setWizardStep('1.1')
  }

  const renderLeaveTypeSelect = (row: DraftRow, member: Staff) => {
    return (
      <div className="space-y-1">
        <Label className="text-[11px] text-muted-foreground">Leave type</Label>
        <Select
          value={row.leaveChoice}
          onValueChange={(value) => {
            const nextChoice = value as LeaveChoice
            const capacity = getCapacity(member, row.sptBaseFTE)
            setRow(row.staffId, (current, currentMember) => {
              const next = { ...current, leaveChoice: nextChoice }
              if (nextChoice === '__none__') {
                next.customLeaveText = ''
                next.fteRemaining = capacity
                next.fteSubtraction = 0
                if (currentMember.rank === 'PCA' || currentMember.rank === 'workman') {
                  next.availableSlots = defaultSlotsFromCapacity(capacity)
                  next.invalidSlots = []
                }
                next.amPmSelection = ''
                next.specialProgramAvailable = false
                return next
              }
              if (nextChoice !== 'others') {
                next.customLeaveText = ''
                const mapped = LEAVE_TYPE_FTE_MAP[nextChoice as keyof typeof LEAVE_TYPE_FTE_MAP]
                if (typeof mapped === 'number') {
                  const remain = clamp(round2(mapped), 0, capacity)
                  next.fteRemaining = remain
                  next.fteSubtraction = clamp(round2(capacity - remain), 0, capacity)
                  if (currentMember.rank === 'PCA' || currentMember.rank === 'workman') {
                    next.availableSlots = defaultSlotsFromCapacity(remain)
                    next.invalidSlots = []
                  }
                }
              }
              return next
            })
          }}
        >
          <SelectTrigger className="h-8 w-[148px]">
            <SelectValue placeholder="On duty" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">On duty</SelectItem>
            {LEAVE_CHOICES.map((choice) => (
              <SelectItem key={choice} value={choice}>
                {choice}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    )
  }

  const renderCustomLeaveInput = (row: DraftRow) => {
    if (row.leaveChoice !== 'others') return null
    const isEditing = customEditingById[row.staffId] || row.customLeaveText.trim().length === 0
    return (
      <div className="w-[140px] space-y-1">
        <Label className="text-[11px] text-muted-foreground">Custom leave text</Label>
        {isEditing ? (
          <Input
            className="h-8 w-full"
            value={row.customLeaveText}
            placeholder="Enter text"
            onChange={(event) => {
              const value = event.target.value
              setRow(row.staffId, (current) => ({ ...current, customLeaveText: value }))
            }}
            onBlur={() => setCustomEditingById((prev) => ({ ...prev, [row.staffId]: false }))}
          />
        ) : (
          <button
            type="button"
            className="h-8 w-full truncate rounded-md border border-input bg-background px-3 text-left text-sm"
            title={row.customLeaveText}
            onClick={() => setCustomEditingById((prev) => ({ ...prev, [row.staffId]: true }))}
          >
            {row.customLeaveText}
          </button>
        )}
      </div>
    )
  }

  const renderTherapistRow = (row: DraftRow, member: Staff) => {
    const showAmPm = (member.rank === 'APPT' || member.rank === 'RPT') && (row.fteRemaining === 0.25 || row.fteRemaining === 0.5)
    const showSpecialProgram = hasSpecialProgramForToday(member.id)
    return (
      <div key={row.staffId} className="py-3">
        <div className="flex items-center justify-between gap-2">
          <label className="inline-flex min-w-0 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={row.selected}
              onChange={(event) => toggleRowSelected(row.staffId, event.target.checked)}
            />
            <span className="truncate font-medium" title={member.name}>
              {member.name}
            </span>
            {member.rank !== 'SPT' && member.team ? (
              <Badge
                variant="outline"
                className={cn('select-none px-1.5 py-0.5 text-[11px] font-medium', getTeamBadgeClass(member.team as any))}
                title={member.team ?? undefined}
              >
                {member.team ?? '--'}
              </Badge>
            ) : null}
            <Badge
              variant="outline"
              className="select-none px-1.5 py-0.5 text-[11px] font-medium border-slate-200 bg-slate-50 text-slate-700"
            >
              {member.rank}
            </Badge>
          </label>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeRow(row.staffId)} title="Remove from draft">
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>

        <div className="mt-2 flex flex-wrap items-end gap-2">
          {renderLeaveTypeSelect(row, member)}
          {renderCustomLeaveInput(row)}

          {member.rank === 'SPT' ? (
            <>
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Base FTE</Label>
                <Input
                  className="h-8 w-[90px]"
                  value={row.sptBaseFTE.toFixed(2)}
                  onChange={(event) => {
                    const parsed = Number.parseFloat(event.target.value)
                    const base = Number.isFinite(parsed) ? clamp(round2(parsed), 0, 1) : 0
                    setRow(row.staffId, (current) => {
                      const leaveCost = clamp(current.fteSubtraction, 0, base)
                      return {
                        ...current,
                        sptBaseFTE: base,
                        fteSubtraction: leaveCost,
                        fteRemaining: clamp(round2(base - leaveCost), 0, base),
                      }
                    })
                  }}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Leave cost</Label>
                <Input
                  className="h-8 w-[90px]"
                  value={row.fteSubtraction.toFixed(2)}
                  onChange={(event) => {
                    const parsed = Number.parseFloat(event.target.value)
                    const leaveCost = Number.isFinite(parsed) ? clamp(round2(parsed), 0, row.sptBaseFTE) : 0
                    setRow(row.staffId, (current) => ({
                      ...current,
                      fteSubtraction: leaveCost,
                      fteRemaining: clamp(round2(current.sptBaseFTE - leaveCost), 0, current.sptBaseFTE),
                    }))
                  }}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">FTE remaining</Label>
                <div className="h-8 rounded-md border border-input bg-muted/40 px-2 text-sm leading-8">
                  {row.fteRemaining.toFixed(2)}
                </div>
              </div>
            </>
          ) : (
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">FTE remaining</Label>
              <Input
                className="h-8 w-[90px]"
                value={row.fteRemaining.toFixed(2)}
                onChange={(event) => {
                  const parsed = Number.parseFloat(event.target.value)
                  const value = Number.isFinite(parsed) ? clamp(round2(parsed), 0, 1) : 0
                  setRow(row.staffId, (current) => ({
                    ...current,
                    fteRemaining: value,
                    fteSubtraction: clamp(round2(1 - value), 0, 1),
                    amPmSelection: value === 0.25 || value === 0.5 ? current.amPmSelection : '',
                  }))
                }}
              />
            </div>
          )}

          {showAmPm ? (
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">AM/PM</Label>
              <Select
                value={row.amPmSelection || ''}
                onValueChange={(value) => {
                  const next = value === 'AM' || value === 'PM' ? value : ''
                  setRow(row.staffId, (current) => ({ ...current, amPmSelection: next }))
                }}
              >
                <SelectTrigger className="h-8 w-[90px]">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="AM">AM</SelectItem>
                  <SelectItem value="PM">PM</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : null}

          {showSpecialProgram ? (
            <label className="inline-flex items-center gap-2 rounded-md border border-border px-2 py-1 text-xs">
              <input
                type="checkbox"
                checked={row.specialProgramAvailable}
                onChange={(event) => setRow(row.staffId, (current) => ({ ...current, specialProgramAvailable: event.target.checked }))}
              />
              Available during special program slot
            </label>
          ) : null}
        </div>
      </div>
    )
  }

  const renderPcaRow = (row: DraftRow, member: Staff) => {
    const capacity = getCapacity(member, row.sptBaseFTE)
    const maxSlotCount = clamp(Math.round(capacity / 0.25), 0, 4)
    const unavailableSlots = SLOT_OPTIONS.filter((slot) => !row.availableSlots.includes(slot))
    return (
      <div key={row.staffId} className="py-3">
        <div className="flex items-center justify-between gap-2">
          <label className="inline-flex min-w-0 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={row.selected}
              onChange={(event) => toggleRowSelected(row.staffId, event.target.checked)}
            />
            <span className="truncate font-medium" title={member.name}>
              {member.name}
            </span>
            {member.floating ? (
              <Badge
                variant="outline"
                className="select-none px-1.5 py-0.5 text-[11px] font-medium border-blue-200 bg-blue-50 text-blue-700"
              >
                Floating
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className={cn('select-none px-1.5 py-0.5 text-[11px] font-medium', getTeamBadgeClass(member.team as any))}
              >
                {member.team ?? '--'}
              </Badge>
            )}
          </label>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeRow(row.staffId)} title="Remove from draft">
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>

        <div className="mt-2 flex flex-wrap items-end gap-2">
          {renderLeaveTypeSelect(row, member)}
          {renderCustomLeaveInput(row)}

          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">A/V slots</Label>
            <div className="flex gap-1">
              {SLOT_OPTIONS.map((slot) => {
                const selected = row.availableSlots.includes(slot)
                const reachedCap = !selected && row.availableSlots.length >= maxSlotCount
                return (
                  <Button
                    key={`${row.staffId}-slot-${slot}`}
                    type="button"
                    variant="outline"
                    size="sm"
                    className={cn('h-8 min-w-8 px-2', selected && 'bg-blue-600 text-white hover:bg-blue-600 hover:text-white')}
                    disabled={reachedCap}
                    onClick={() => {
                      setRow(row.staffId, (current) => {
                        const has = current.availableSlots.includes(slot)
                        let nextSlots = current.availableSlots
                        if (has) nextSlots = current.availableSlots.filter((item) => item !== slot)
                        else if (current.availableSlots.length < maxSlotCount) nextSlots = [...current.availableSlots, slot].sort((a, b) => a - b)
                        const nextRemaining = clamp(round2(nextSlots.length * 0.25), 0, capacity)
                        const nextUnavailable = SLOT_OPTIONS.filter((item) => !nextSlots.includes(item))
                        return {
                          ...current,
                          availableSlots: nextSlots,
                          fteRemaining: nextRemaining,
                          fteSubtraction: clamp(round2(capacity - nextRemaining), 0, capacity),
                          invalidSlots: current.invalidSlots.filter((entry) => nextUnavailable.includes(entry.slot as 1 | 2 | 3 | 4)),
                        }
                      })
                    }}
                  >
                    {slot}
                  </Button>
                )
              })}
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">FTE remaining</Label>
            <div className="h-8 rounded-md border border-input bg-muted/40 px-2 text-sm leading-8">
              {row.fteRemaining.toFixed(2)}
            </div>
          </div>
        </div>

        {unavailableSlots.length > 0 ? (
          <div className="mt-3 pt-1">
            <div className="mb-1 text-[11px] font-medium text-muted-foreground">Slots with partial presence</div>
            <div className="space-y-2">
              {unavailableSlots.map((slot) => {
                const existing = row.invalidSlots.find((entry) => entry.slot === slot)
                return (
                  <div key={`${row.staffId}-partial-${slot}`} className="flex flex-wrap items-center gap-2 text-xs">
                    <label className="inline-flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={!!existing}
                        onChange={(event) => {
                          if (event.target.checked) {
                            setRow(row.staffId, (current) => ({
                              ...current,
                              invalidSlots: [...current.invalidSlots, { slot, timeRange: slotDefaultRange(slot) }],
                            }))
                          } else {
                            setRow(row.staffId, (current) => ({
                              ...current,
                              invalidSlots: current.invalidSlots.filter((entry) => entry.slot !== slot),
                            }))
                          }
                        }}
                      />
                      Slot {slot}
                    </label>
                    {existing ? (
                      <>
                        <span className="text-muted-foreground">
                          {existing.timeRange.start}-{existing.timeRange.end}
                        </span>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs">
                              Edit time
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-[380px] rounded-md border border-border bg-white p-3 shadow-md">
                            <div className="text-xs font-medium mb-2">Slot {slot} partial presence</div>
                            <TimeIntervalSlider
                              slot={slot}
                              startTime={slotDefaultRange(slot).start}
                              endTime={slotDefaultRange(slot).end}
                              value={{ start: existing.timeRange.start, end: existing.timeRange.end }}
                              onChange={(range) => {
                                setRow(row.staffId, (current) => ({
                                  ...current,
                                  invalidSlots: current.invalidSlots.map((entry) =>
                                    entry.slot === slot
                                      ? {
                                          ...entry,
                                          timeRange: {
                                            start: normalizeHHMM(range.start),
                                            end: normalizeHHMM(range.end),
                                          },
                                        }
                                      : entry
                                  ),
                                }))
                              }}
                            />
                          </PopoverContent>
                        </Popover>
                        {!isValidRange(existing.timeRange) ? (
                          <span className="text-destructive">Invalid range</span>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                )
              })}
            </div>
          </div>
        ) : null}
      </div>
    )
  }

  const therapistSection = (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-end gap-2 border-b border-border pb-3">
        <div className="text-sm text-muted-foreground">Bulk actions</div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={bulkLeaveTherapist} onValueChange={(value) => setBulkLeaveTherapist(value as LeaveChoice)}>
            <SelectTrigger className="h-8 w-[148px]">
              <SelectValue placeholder="Set leave type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">On duty</SelectItem>
              {LEAVE_CHOICES.map((choice) => (
                <SelectItem key={`bulk-therapist-${choice}`} value={choice}>
                  {choice}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={selectedTherapistCount === 0}
            onClick={() => applyBulkLeaveChoice('therapist', bulkLeaveTherapist)}
          >
            Apply leave type
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={selectedTherapistCount === 0} onClick={() => clearSelectedRows('therapist')}>
            Clear fields
          </Button>
          {isDraftDirty ? (
            <Button type="button" size="sm" variant="ghost" onClick={resetDraft}>
              <RotateCcw className="mr-1 h-3.5 w-3.5" />
              Reset draft
            </Button>
          ) : null}
        </div>
      </div>

      <div className="max-h-[420px] overflow-y-auto overscroll-contain pr-1">
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold tracking-wide text-muted-foreground">SPT</h4>
            <label className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={sptRows.length > 0 && sptRows.every((row) => row.selected)}
                onChange={(event) => setSectionSelected(sptRows, event.target.checked)}
              />
              Select all
            </label>
          </div>
          <div className="divide-y divide-border">
            {sptRows.length > 0 ? sptRows.map((row) => renderTherapistRow(row, staffById.get(row.staffId)!)) : <p className="py-2 text-xs text-muted-foreground">No SPT rows in draft.</p>}
          </div>
          <p className="text-[11px] text-muted-foreground">You can do final SPT leave edit later in Step 2.2 (SPT Final Edit).</p>
        </section>

        <div className="my-3 space-y-[2px]">
          <div className="h-px bg-border" />
          <div className="h-px bg-border/40" />
        </div>

        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold tracking-wide text-muted-foreground">APPT</h4>
            <label className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={apptRows.length > 0 && apptRows.every((row) => row.selected)}
                onChange={(event) => setSectionSelected(apptRows, event.target.checked)}
              />
              Select all
            </label>
          </div>
          <div className="divide-y divide-border">
            {apptRows.length > 0 ? apptRows.map((row) => renderTherapistRow(row, staffById.get(row.staffId)!)) : <p className="py-2 text-xs text-muted-foreground">No APPT rows in draft.</p>}
          </div>
        </section>

        <div className="my-3 space-y-[2px]">
          <div className="h-px bg-border" />
          <div className="h-px bg-border/40" />
        </div>

        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold tracking-wide text-muted-foreground">RPT</h4>
            <label className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={rptRows.length > 0 && rptRows.every((row) => row.selected)}
                onChange={(event) => setSectionSelected(rptRows, event.target.checked)}
              />
              Select all
            </label>
          </div>
          <div className="divide-y divide-border">
            {rptRows.length > 0 ? rptRows.map((row) => renderTherapistRow(row, staffById.get(row.staffId)!)) : <p className="py-2 text-xs text-muted-foreground">No RPT rows in draft.</p>}
          </div>
        </section>
      </div>
    </div>
  )

  const pcaSection = (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-end gap-2 border-b border-border pb-3">
        <div className="text-sm text-muted-foreground">Bulk actions</div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={bulkLeavePca} onValueChange={(value) => setBulkLeavePca(value as LeaveChoice)}>
            <SelectTrigger className="h-8 w-[148px]">
              <SelectValue placeholder="Set leave type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">On duty</SelectItem>
              {LEAVE_CHOICES.map((choice) => (
                <SelectItem key={`bulk-pca-${choice}`} value={choice}>
                  {choice}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={selectedPcaCount === 0}
            onClick={() => applyBulkLeaveChoice('pca', bulkLeavePca)}
          >
            Apply leave type
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={selectedPcaCount === 0} onClick={() => clearSelectedRows('pca')}>
            Clear fields
          </Button>
          {isDraftDirty ? (
            <Button type="button" size="sm" variant="ghost" onClick={resetDraft}>
              <RotateCcw className="mr-1 h-3.5 w-3.5" />
              Reset draft
            </Button>
          ) : null}
        </div>
      </div>

      <div className="max-h-[420px] overflow-y-auto overscroll-contain pr-1">
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold tracking-wide text-muted-foreground">Floating PCA</h4>
            <label className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={floatingPcaRows.length > 0 && floatingPcaRows.every((row) => row.selected)}
                onChange={(event) => setSectionSelected(floatingPcaRows, event.target.checked)}
              />
              Select all
            </label>
          </div>
          <div className="divide-y divide-border">
            {floatingPcaRows.length > 0 ? floatingPcaRows.map((row) => renderPcaRow(row, staffById.get(row.staffId)!)) : <p className="py-2 text-xs text-muted-foreground">No floating PCA rows in draft.</p>}
          </div>
        </section>

        <section className="space-y-2 pt-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold tracking-wide text-muted-foreground">Non-floating PCA</h4>
            <label className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={nonFloatingPcaRows.length > 0 && nonFloatingPcaRows.every((row) => row.selected)}
                onChange={(event) => setSectionSelected(nonFloatingPcaRows, event.target.checked)}
              />
              Select all
            </label>
          </div>
          <div className="divide-y divide-border">
            {nonFloatingPcaRows.length > 0 ? nonFloatingPcaRows.map((row) => renderPcaRow(row, staffById.get(row.staffId)!)) : <p className="py-2 text-xs text-muted-foreground">No non-floating PCA rows in draft.</p>}
          </div>
        </section>
      </div>
    </div>
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] w-[calc(100vw-24px)] max-w-5xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Leave setup</DialogTitle>
          <DialogDescription>
            <span className="block text-xs text-muted-foreground">
              {wizardStep === '1.1' ? 'Step 1.1 · 1 / 4' : null}
              {wizardStep === '1.2' ? 'Step 1.2 · 2 / 4' : null}
              {wizardStep === '1.3' ? 'Step 1.3 · 3 / 4' : null}
              {wizardStep === '1.4' ? 'Step 1.4 · 4 / 4' : null}
            </span>
            <span className="mt-1 block">
              {wizardStep === '1.1'
                ? "Draft is auto-loaded from today’s leave/availability info. Add more staff to include in today’s edits."
                : null}
              {wizardStep === '1.2'
                ? 'Edit therapist leave and FTE on-duty. AM/PM is only for APPT/RPT with FTE remaining 0.25 or 0.50.'
                : null}
              {wizardStep === '1.3'
                ? 'Edit PCA available slots and partial presence. FTE remaining is derived from available slots.'
                : null}
              {wizardStep === '1.4' ? 'Preview today’s leave setup before saving.' : null}
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-auto overscroll-contain pr-1">
          {wizardStep === '1.1' ? (() => {
            const countsByRank: Record<string, number> = { SPT: 0, APPT: 0, RPT: 0, PCA: 0, workman: 0 }
            rows.forEach((r) => {
              const m = staffById.get(r.staffId)
              if (!m) return
              countsByRank[m.rank] = (countsByRank[m.rank] ?? 0) + 1
            })

            const searchExpanded = quickFindOpen || quickFind.trim().length > 0

            return (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div
                      className={cn(
                        'relative h-8',
                        'transition-[width]',
                        searchExpanded ? 'duration-200 ease-out' : 'duration-320 ease-in',
                        searchExpanded ? 'w-[180px]' : 'w-9'
                      )}
                    >
                      <button
                        type="button"
                        aria-label="Search staff"
                        ref={quickFindButtonRef}
                        className={cn(
                          'absolute left-0 top-0 h-8 w-9 inline-flex items-center justify-center rounded-md border border-input bg-background',
                          searchExpanded ? 'border-r-0 rounded-r-none' : null
                        )}
                        onClick={() => {
                          setQuickFindOpen(true)
                          // user-initiated: focus the input after expanding
                          try {
                            window.requestAnimationFrame(() => quickFindInputRef.current?.focus())
                          } catch {
                            // ignore
                          }
                        }}
                      >
                        <Search className="h-4 w-4 text-muted-foreground" />
                      </button>
                        <Input
                        id="step1-quick-find"
                        ref={quickFindInputRef}
                        className={cn(
                          'absolute top-0 h-8',
                            'left-9 w-[calc(100%-36px)] rounded-l-none',
                            searchExpanded ? 'opacity-100' : 'opacity-0 pointer-events-none',
                          searchExpanded ? 'transition-[opacity] duration-200' : 'transition-[opacity] duration-260'
                        )}
                        placeholder="Type name..."
                        value={quickFind}
                        onFocus={() => setQuickFindOpen(true)}
                        onBlur={() => {
                          if (quickFind.trim().length === 0) setQuickFindOpen(false)
                        }}
                        onChange={(event) => {
                          const next = event.target.value
                          setQuickFind(next)
                          // Collapse immediately once user clears the last character.
                          if (next.trim().length === 0) {
                            setQuickFindOpen(false)
                            try {
                              window.requestAnimationFrame(() => {
                                quickFindInputRef.current?.blur()
                                quickFindButtonRef.current?.focus()
                              })
                            } catch {
                              // ignore
                            }
                          }
                        }}
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="text-muted-foreground">Draft rows</span>
                    {(['SPT', 'APPT', 'RPT', 'PCA'] as const).map((rank) => (
                      <span key={`draft-count-${rank}`} className="inline-flex items-center gap-1">
                        <Badge
                          variant="outline"
                          className={cn('select-none px-1.5 py-0.5 text-[11px] font-medium', RANK_BADGE_NEUTRAL_CLASS)}
                        >
                          {rank}
                        </Badge>
                        <span className="text-muted-foreground">{countsByRank[rank] ?? 0}</span>
                      </span>
                    ))}
                    {isDraftDirty ? (
                      <Button type="button" size="sm" variant="ghost" onClick={resetDraft}>
                        <RotateCcw className="mr-1 h-3.5 w-3.5" />
                        Reset draft
                      </Button>
                    ) : null}
                  </div>
                </div>

                <div className="rounded-md border border-border overflow-hidden">
                  <div className="grid gap-0 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,0.85fr)] divide-x divide-border items-stretch">
                    {/* Left: pickers */}
                    <div className="min-h-[420px] flex flex-col">
                      <div className="px-3 py-2 text-xs font-semibold text-muted-foreground border-b border-border">
                        Add staff
                      </div>
                      <div className="min-h-0 flex-1">
                        <div className="grid h-full grid-cols-2 md:grid-cols-2 xl:grid-cols-4 divide-x divide-border">
                          {(['SPT', 'APPT', 'RPT', 'PCA'] as const).map((rank) => (
                            <div key={`picker-${rank}`} className="min-h-0 flex flex-col">
                              <div className="px-2 py-1.5 border-b border-border flex items-center gap-2">
                                <Badge variant="outline" className={cn('select-none px-1.5 py-0.5 text-[11px] font-medium', RANK_BADGE_NEUTRAL_CLASS)}>
                                  {rank}
                                </Badge>
                              </div>
                              <div className="min-h-0 flex-1 overflow-y-auto p-2 space-y-1">
                                {filteredPickers[rank].map((member) => {
                                  const exists = rowIds.has(member.id)
                                  return (
                                    <div
                                      key={member.id}
                                      className={cn(
                                        'flex items-center justify-between gap-2 rounded px-1 py-1',
                                        exists ? 'bg-muted/60 ring-1 ring-muted/80' : 'hover:bg-muted/20'
                                      )}
                                    >
                                      <div className="min-w-0 flex items-center gap-2">
                                        <span className="truncate text-xs" title={member.name}>
                                          {member.name}
                                        </span>
                                        <span className="text-[10px] text-muted-foreground">{member.team ?? '--'}</span>
                                      </div>
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant={exists ? 'secondary' : 'outline'}
                                        className="h-6 px-2 text-[11px]"
                                        onClick={() => {
                                          if (exists) removeRow(member.id)
                                          else addRow(member)
                                        }}
                                      >
                                        {exists ? 'Added' : <Plus className="h-3.5 w-3.5" />}
                                      </Button>
                                    </div>
                                  )
                                })}
                                {filteredPickers[rank].length === 0 ? (
                                  <p className="px-1 py-2 text-xs text-muted-foreground">No staff.</p>
                                ) : null}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Right: draft preview */}
                    <div className="min-h-[420px] flex flex-col">
                      <div className="px-3 py-2 text-xs font-semibold text-muted-foreground border-b border-border">
                        Draft list
                      </div>
                      <div className="min-h-0 flex-1 overflow-y-auto p-2">
                        {rows.length === 0 ? (
                          <p className="py-4 text-center text-xs text-muted-foreground">No staff in draft yet.</p>
                        ) : (
                          <div className="divide-y divide-border rounded-md border border-border overflow-hidden">
                            {rows
                              .slice()
                              .sort((a, b) => {
                                const memberA = staffById.get(a.staffId)
                                const memberB = staffById.get(b.staffId)
                                if (!memberA || !memberB) return 0
                                const rankOrder = (RANK_ORDER[memberA.rank] ?? 99) - (RANK_ORDER[memberB.rank] ?? 99)
                                if (rankOrder !== 0) return rankOrder
                                return memberA.name.localeCompare(memberB.name)
                              })
                              .map((row) => {
                                const member = staffById.get(row.staffId)
                                if (!member) return null
                                const leavePreview =
                                  row.leaveChoice === '__none__'
                                    ? 'On duty'
                                    : row.leaveChoice === 'others'
                                      ? (row.customLeaveText.trim() || 'others')
                                      : row.leaveChoice
                              return (
                                <div
                                  key={`draft-preview-${row.staffId}`}
                                  className="flex items-center justify-between px-2 py-1 hover:bg-muted/30"
                                >
                                  <div className="min-w-0">
                                    <div className="truncate text-xs font-medium">{member.name}</div>
                                    <div className="truncate text-[11px] text-muted-foreground">
                                      {member.rank} · {member.team ?? '--'} · {leavePreview}
                                    </div>
                                  </div>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6"
                                      onClick={() => removeRow(row.staffId)}
                                    >
                                      <X className="h-3.5 w-3.5" />
                                    </Button>
                                  </div>
                                )
                              })}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )
          })() : null}

          {wizardStep === '1.2' ? therapistSection : null}
          {wizardStep === '1.3' ? pcaSection : null}

          {wizardStep === '1.4' ? (
            <div className="space-y-3">
              {rows.filter((r) => r.leaveChoice !== '__none__').length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">No leave entries in draft.</p>
              ) : (
                <div className="divide-y divide-border rounded-md border border-border overflow-hidden">
                  {rows
                    .slice()
                    .sort((a, b) => {
                      const memberA = staffById.get(a.staffId)
                      const memberB = staffById.get(b.staffId)
                      if (!memberA || !memberB) return 0
                      const rankOrder = (RANK_ORDER[memberA.rank] ?? 99) - (RANK_ORDER[memberB.rank] ?? 99)
                      if (rankOrder !== 0) return rankOrder
                      return memberA.name.localeCompare(memberB.name)
                    })
                    .filter((row) => row.leaveChoice !== '__none__')
                    .map((row) => {
                      const member = staffById.get(row.staffId)
                      if (!member) return null
                      const leavePreview =
                        row.leaveChoice === 'others'
                          ? (row.customLeaveText.trim() || 'others')
                          : row.leaveChoice
                      const finalEdit = rowToFinalEdit(row, member)
                      const isPca = member.rank === 'PCA' || member.rank === 'workman'
                      const showPcaDetails = isPca && finalEdit.fteRemaining > 0.0001
                      const avSlots = Array.isArray(finalEdit.availableSlots) ? finalEdit.availableSlots : []
                      const partial = Array.isArray(finalEdit.invalidSlots) ? finalEdit.invalidSlots : []
                      return (
                        <div key={`preview-${row.staffId}`} className="flex items-center justify-between px-3 py-2 hover:bg-muted/30">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="truncate text-sm font-medium">{member.name}</div>
                              <Badge variant="outline" className={cn('select-none px-1.5 py-0.5 text-[10px] font-medium', RANK_BADGE_NEUTRAL_CLASS)}>
                                {member.rank}
                              </Badge>
                              {member.floating ? (
                                <Badge
                                  variant="outline"
                                  className="select-none px-1.5 py-0.5 text-[10px] font-medium border-blue-200 bg-blue-50 text-blue-700"
                                >
                                  Floating
                                </Badge>
                              ) : (
                                member.rank === 'SPT' ? null : (
                                  <Badge
                                    variant="outline"
                                    className={cn(
                                      'select-none px-1.5 py-0.5 text-[10px] font-medium',
                                      getTeamBadgeClass(member.team as any)
                                    )}
                                  >
                                    {member.team ?? '--'}
                                  </Badge>
                                )
                              )}
                            </div>
                            <div className="truncate text-[11px] text-muted-foreground">{leavePreview}</div>
                            {showPcaDetails ? (
                              <div className="mt-1 text-[11px] text-muted-foreground">
                                {avSlots.length > 0 ? `Available slots: ${avSlots.join(', ')}` : 'Available slots: —'}
                                {partial.length > 0
                                  ? ` · Partial presence: ${partial.map((p) => `Slot ${p.slot} ${p.timeRange.start}-${p.timeRange.end}`).join(', ')}`
                                  : ''}
                              </div>
                            ) : null}
                          </div>
                          <div className="text-xs text-muted-foreground">FTE {finalEdit.fteRemaining.toFixed(2)}</div>
                        </div>
                      )
                    })}
                </div>
              )}
            </div>
          ) : null}
        </div>

        {saveError ? <p className="text-sm text-destructive">{saveError}</p> : null}

        <DialogFooter className="gap-2 border-t border-border pt-3">
          {wizardStep !== '1.1' ? (
            <Button type="button" variant="outline" onClick={prevStep} disabled={saving}>
              Back
            </Button>
          ) : null}
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          {wizardStep !== '1.4' ? (
            <Button type="button" onClick={nextStep} disabled={saving}>
              Next
            </Button>
          ) : (
            <Button type="button" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save & Apply to Step 1'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

