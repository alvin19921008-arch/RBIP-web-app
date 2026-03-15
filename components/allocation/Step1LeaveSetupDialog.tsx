'use client'

import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { formatTimeRange, getSlotTime } from '@/lib/utils/slotHelpers'
import { isOnDutyLeaveType } from '@/lib/utils/leaveType'
import { SpecialProgram, SPTAllocation } from '@/types/allocation'
import { LEAVE_TYPE_FTE_MAP, LeaveType, Staff, Weekday } from '@/types/staff'
import { Check, CircleHelp, Plus, RotateCcw, Search, X } from 'lucide-react'
import { getTeamBadgeClass } from '@/components/allocation/teamThemePalette'
import { TimeIntervalSlider } from '@/components/allocation/TimeIntervalSlider'
import { matchesStaffName } from '@/lib/utils/staffFilters'
import {
  getEffectiveSharedTherapistAllocationMode,
  getSharedTherapistBaseAllocationMode,
  normalizeSharedTherapistStep1StateForModeChange,
} from '@/lib/features/schedule/sharedTherapistStep'
import { getSharedTherapistModeControlPresentation } from '@/lib/features/schedule/sharedTherapistModeControlPresentation'
import {
  getStep1TherapistSpecialProgramInfo,
  getTherapistSpecialProgramUiState,
  normalizeStep1SpecialProgramAvailabilityForSave,
  shouldShowStep1SpecialProgramAvailabilityToggle,
} from '@/lib/utils/step1SpecialProgramAvailability'

type StaffOverrideLite = {
  leaveType?: LeaveType | null
  fteRemaining?: number
  sharedTherapistModeOverride?: import('@/types/staff').SharedTherapistAllocationMode
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
  sharedTherapistModeOverride?: import('@/types/staff').SharedTherapistAllocationMode
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
  sharedTherapistBaseMode?: import('@/types/staff').SharedTherapistAllocationMode
  sharedTherapistModeOverride?: import('@/types/staff').SharedTherapistAllocationMode
  availableSlots: number[]
  invalidSlots: InvalidSlotDraft[]
  amPmSelection: 'AM' | 'PM' | ''
  specialProgramAvailable?: boolean
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

const SHARED_THERAPIST_BADGE_CLASS =
  'border-gray-200 bg-gray-100 text-gray-700 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-300'

/** Special program badge: blue tone (Step 1.1 and SPT dialogs). */
const STEP1_SPECIAL_PROGRAM_BADGE_CLASS =
  'select-none px-1 py-0.5 text-[9px] font-medium text-blue-900 border-blue-200 bg-blue-50 whitespace-nowrap dark:text-blue-200 dark:border-blue-800 dark:bg-blue-950/40'

/** SPT weekday duty badge: light orange-yellow (Step 1.1 Add staff). */
const STEP1_SPT_DUTY_BADGE_CLASS =
  'select-none px-1 py-0.5 text-[9px] font-medium text-amber-900 border-amber-200 bg-amber-50 whitespace-nowrap dark:text-amber-200 dark:border-amber-800 dark:bg-amber-950/40'

function formatWeekdayLabel(w: Weekday): string {
  return w.charAt(0).toUpperCase() + w.slice(1)
}

const NARROW_VIEWPORT_FOOTER_CLASS =
  'sticky bottom-0 z-10 mt-4 flex-row flex-nowrap items-center justify-end gap-2 border-t border-border bg-background/95 px-1 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.35rem)] backdrop-blur supports-[backdrop-filter]:bg-background/85 sm:px-0 [&>button]:shrink [&>button]:min-w-0'

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
  const [step11Pane, setStep11Pane] = useState<'add' | 'draft'>('add')
  const [quickFind, setQuickFind] = useState('')
  const [quickFindOpen, setQuickFindOpen] = useState(false)
  const quickFindInputRef = useRef<HTMLInputElement | null>(null)
  const quickFindButtonRef = useRef<HTMLButtonElement | null>(null)
  const [rows, setRows] = useState<DraftRow[]>([])
  const [initialRows, setInitialRows] = useState<DraftRow[]>([])
  // Local string state for numeric FTE inputs — lets user type freely; committed on blur.
  const [fteStringInputs, setFteStringInputs] = useState<Record<string, { fteRemaining: string; fteSubtraction: string; sptBaseFTE: string }>>({})
  const getFteInput = (staffId: string, field: 'fteRemaining' | 'fteSubtraction' | 'sptBaseFTE', fallback: number) =>
    fteStringInputs[staffId]?.[field] ?? fallback.toFixed(2)
  const setFteInput = (staffId: string, field: 'fteRemaining' | 'fteSubtraction' | 'sptBaseFTE', value: string) =>
    setFteStringInputs((prev) => ({ ...prev, [staffId]: { ...prev[staffId], [field]: value } }))
  const syncFteInputs = (staffId: string, fields: Partial<{ fteRemaining: number; fteSubtraction: number; sptBaseFTE: number }>) =>
    setFteStringInputs((prev) => ({
      ...prev,
      [staffId]: {
        ...prev[staffId],
        ...Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, (v as number).toFixed(2)])),
      },
    }))
  const [customEditingById, setCustomEditingById] = useState<Record<string, boolean>>({})
  const [partialPresenceOpenById, setPartialPresenceOpenById] = useState<Record<string, boolean>>({})
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

  const therapistSpecialProgramInfoByStaffId = useMemo(() => {
    const map = new Map<string, ReturnType<typeof getStep1TherapistSpecialProgramInfo>>()
    activeStaff.forEach((member) => {
      map.set(
        member.id,
        getStep1TherapistSpecialProgramInfo({
          member,
          allStaff: activeStaff,
          specialPrograms,
          weekday,
        })
      )
    })
    return map
  }, [activeStaff, specialPrograms, weekday])

  /** SPT badge for Add staff: [weekday] · [FTE] or "On duty". When SPT has special program this day and no base FTE, show special program badge instead. */
  const sptBadgeByStaffId = useMemo(() => {
    const map = new Map<
      string,
      { label: string; showSpecialProgramBadge: boolean }
    >()
    for (const allocation of sptAllocations) {
      const cfg = allocation.config_by_weekday?.[weekday]
      const hasDuty =
        (cfg && cfg.enabled !== false) ||
        (Array.isArray(allocation.weekdays) && allocation.weekdays.includes(weekday))
      if (!hasDuty) continue
      const baseFte = sptBaseFteByStaffId.get(allocation.staff_id) ?? 0
      const specialProgramInfo = therapistSpecialProgramInfoByStaffId.get(allocation.staff_id) ?? null
      const showSpecialProgramBadge = !!(specialProgramInfo && baseFte === 0)
      const label =
        baseFte > 0
          ? `${formatWeekdayLabel(weekday)} · ${baseFte} FTE`
          : `${formatWeekdayLabel(weekday)} · On duty`
      map.set(allocation.staff_id, { label, showSpecialProgramBadge })
    }
    return map
  }, [sptAllocations, weekday, sptBaseFteByStaffId, therapistSpecialProgramInfoByStaffId])

  const getCapacity = (member: Staff, sptBase: number): number => {
    if (member.rank === 'SPT') return clamp(sptBase, 0, 1)
    if (typeof member.buffer_fte === 'number' && member.status === 'buffer') {
      return clamp(member.buffer_fte, 0, 1)
    }
    return 1
  }

  const isSharedTherapist = (member: Staff) =>
    (member.rank === 'APPT' || member.rank === 'RPT') && member.team === null

  const getEffectiveSharedTherapistModeForRow = (row: DraftRow) =>
    getEffectiveSharedTherapistAllocationMode({
      staffMode: row.sharedTherapistBaseMode,
      overrideMode: row.sharedTherapistModeOverride,
    })
  const sharedTherapistModeControlPresentation = getSharedTherapistModeControlPresentation()

  const buildDraftRow = (member: Staff, sourceOverride: StaffOverrideLite | undefined): DraftRow => {
    const sptBaseFromConfig = member.rank === 'SPT' ? sptBaseFteByStaffId.get(member.id) ?? 0 : 1
    const baseCapacity = getCapacity(member, sptBaseFromConfig)
    const sharedTherapistBaseMode = isSharedTherapist(member)
      ? getSharedTherapistBaseAllocationMode(member)
      : undefined
    const sharedTherapistModeOverride =
      isSharedTherapist(member) &&
      (sourceOverride?.sharedTherapistModeOverride === 'slot-based' || sourceOverride?.sharedTherapistModeOverride === 'single-team')
        ? sourceOverride.sharedTherapistModeOverride
        : undefined
    const effectiveSharedTherapistMode = getEffectiveSharedTherapistAllocationMode({
      staffMode: sharedTherapistBaseMode,
      overrideMode: sharedTherapistModeOverride,
    })
    const slotBasedSharedTherapist = isSharedTherapist(member) && effectiveSharedTherapistMode === 'slot-based'
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

    const pcaLike = member.rank === 'PCA' || member.rank === 'workman' || slotBasedSharedTherapist
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
      sharedTherapistBaseMode,
      sharedTherapistModeOverride,
      availableSlots,
      invalidSlots,
      amPmSelection: sourceOverride?.amPmSelection ?? '',
      specialProgramAvailable: sourceOverride?.specialProgramAvailable,
      selected: false,
    }
  }

  const hasStep1OverrideData = (member: Staff, override: StaffOverrideLite | undefined): boolean => {
    if (!override || typeof override !== 'object') return false
    if (isOnDutyLeaveType(override.leaveType)) return false
    const sptBase = member.rank === 'SPT' ? sptBaseFteByStaffId.get(member.id) ?? 0 : 1
    const capacity = getCapacity(member, sptBase)
    const sharedTherapistBaseMode = isSharedTherapist(member)
      ? getSharedTherapistBaseAllocationMode(member)
      : undefined
    const effectiveSharedTherapistMode = getEffectiveSharedTherapistAllocationMode({
      staffMode: sharedTherapistBaseMode,
      overrideMode: override.sharedTherapistModeOverride,
    })
    if (typeof override.fteRemaining === 'number' && Math.abs(override.fteRemaining - capacity) > 0.0001) return true
    if (typeof override.fteSubtraction === 'number' && override.fteSubtraction > 0.0001) return true
    if (Array.isArray(override.invalidSlots) && override.invalidSlots.length > 0) return true
    if (override.amPmSelection === 'AM' || override.amPmSelection === 'PM') return true
    if (override.specialProgramAvailable !== undefined) return true
    if (override.sharedTherapistModeOverride && override.sharedTherapistModeOverride !== sharedTherapistBaseMode) return true
    if (member.rank === 'PCA' || member.rank === 'workman' || effectiveSharedTherapistMode === 'slot-based') {
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
    setStep11Pane('add')
    setQuickFind('')
    setQuickFindOpen(false)
    setCustomEditingById({})
    setPartialPresenceOpenById({})
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
    const filtered = activeStaff.filter((member) => matchesStaffName(member, quickFind))
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
    const effectiveSharedTherapistMode = getEffectiveSharedTherapistModeForRow(row)
    const pcaLike =
      member.rank === 'PCA' ||
      member.rank === 'workman' ||
      (isSharedTherapist(member) && effectiveSharedTherapistMode === 'slot-based')
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
    const showAmPm = (member.rank === 'APPT' || member.rank === 'RPT') && fteRemaining > 0 && fteRemaining <= 0.5

    const hasSpecialProgramToday = (therapistSpecialProgramInfoByStaffId.get(member.id) ?? null) !== null

    return {
      staffId: member.id,
      leaveType: finalLeaveType,
      fteRemaining,
      sharedTherapistModeOverride:
        isSharedTherapist(member) && row.sharedTherapistModeOverride !== row.sharedTherapistBaseMode
          ? row.sharedTherapistModeOverride
          : undefined,
      fteSubtraction,
      availableSlots,
      invalidSlots,
      amPmSelection: showAmPm && row.amPmSelection ? row.amPmSelection : undefined,
      specialProgramAvailable: normalizeStep1SpecialProgramAvailabilityForSave({
        hasSpecialProgramToday,
        shouldShowToggle: shouldShowStep1SpecialProgramAvailabilityToggle({
          rank: member.rank,
          hasSpecialProgramToday,
          leaveType: finalLeaveType,
          fteRemaining,
          fteSubtraction,
        }),
        selected: row.specialProgramAvailable,
      }),
    }
  }

  function buildDefaultEdit(member: Staff, sptBaseFromConfig: number): Step1SaveEdit {
    const capacity = getCapacity(member, sptBaseFromConfig)
    const sharedTherapistBaseMode = isSharedTherapist(member)
      ? getSharedTherapistBaseAllocationMode(member)
      : undefined
    const pcaLike =
      member.rank === 'PCA' ||
      member.rank === 'workman' ||
      (isSharedTherapist(member) && sharedTherapistBaseMode === 'slot-based')
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
          sharedTherapistModeOverride: defaultEdit.sharedTherapistModeOverride,
          fteSubtraction: defaultEdit.fteSubtraction ?? 0,
          availableSlots: defaultEdit.availableSlots ?? [],
          invalidSlots: [],
          amPmSelection: '',
          specialProgramAvailable: undefined,
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
          if (member.rank === 'PCA' || member.rank === 'workman' || getEffectiveSharedTherapistModeForRow(next) === 'slot-based') {
            next.availableSlots = defaultSlotsFromCapacity(capacity)
            next.invalidSlots = []
          }
          next.amPmSelection = ''
          next.specialProgramAvailable = undefined
          return next
        }

        if (leaveChoice !== 'others') {
          const mapped = LEAVE_TYPE_FTE_MAP[leaveChoice as keyof typeof LEAVE_TYPE_FTE_MAP]
          if (typeof mapped === 'number') {
            const remain = clamp(round2(mapped), 0, capacity)
            next.fteRemaining = remain
            next.fteSubtraction = clamp(round2(capacity - remain), 0, capacity)
            if (member.rank === 'PCA' || member.rank === 'workman' || getEffectiveSharedTherapistModeForRow(next) === 'slot-based') {
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
    setPartialPresenceOpenById({})
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

  const applySharedTherapistModeForDay = (
    row: DraftRow,
    member: Staff,
    nextModeOverride: import('@/types/staff').SharedTherapistAllocationMode | undefined
  ) => {
    const capacity = getCapacity(member, row.sptBaseFTE)
    const targetMode = getEffectiveSharedTherapistAllocationMode({
      staffMode: row.sharedTherapistBaseMode,
      overrideMode: nextModeOverride,
    })
    setRow(row.staffId, (current) => {
      const normalized = normalizeSharedTherapistStep1StateForModeChange({
        targetMode,
        capacity,
        fteRemaining: current.fteRemaining,
        fteSubtraction: current.fteSubtraction,
        availableSlots: current.availableSlots,
        invalidSlots: current.invalidSlots,
        amPmSelection: current.amPmSelection || undefined,
      })
      syncFteInputs(row.staffId, {
        fteRemaining: normalized.fteRemaining,
        fteSubtraction: normalized.fteSubtraction,
      })
      return {
        ...current,
        sharedTherapistModeOverride: nextModeOverride,
        fteRemaining: normalized.fteRemaining,
        fteSubtraction: normalized.fteSubtraction,
        availableSlots: normalized.availableSlots ?? [],
        invalidSlots: normalized.invalidSlots ?? [],
        amPmSelection: normalized.amPmSelection ?? '',
      }
    })
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

  const renderStep11PaneSwitch = () => (
    <div className="inline-flex items-center rounded-md border border-border bg-background p-0.5 lg:hidden">
      <button
        type="button"
        aria-label="Show add staff panel"
        aria-pressed={step11Pane === 'add'}
        className={cn(
          'h-6 rounded px-2.5 text-[11px] font-medium transition-colors',
          step11Pane === 'add'
            ? 'bg-amber-100 text-amber-950 shadow-sm shadow-amber-200 ring-1 ring-amber-200'
            : 'text-muted-foreground hover:text-foreground'
        )}
        onClick={() => setStep11Pane('add')}
      >
        Add
      </button>
      <button
        type="button"
        aria-label="Show draft list panel"
        aria-pressed={step11Pane === 'draft'}
        className={cn(
          'h-6 rounded px-2.5 text-[11px] font-medium transition-colors',
          step11Pane === 'draft'
            ? 'bg-amber-100 text-amber-950 shadow-sm shadow-amber-200 ring-1 ring-amber-200'
            : 'text-muted-foreground hover:text-foreground'
        )}
        onClick={() => setStep11Pane('draft')}
      >
        Draft ({rows.length})
      </button>
    </div>
  )

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
              const slotBasedSharedTherapist =
                isSharedTherapist(currentMember) && getEffectiveSharedTherapistModeForRow(next) === 'slot-based'
              if (nextChoice === '__none__') {
                next.customLeaveText = ''
                next.fteRemaining = capacity
                next.fteSubtraction = 0
                if (currentMember.rank === 'PCA' || currentMember.rank === 'workman' || slotBasedSharedTherapist) {
                  next.availableSlots = defaultSlotsFromCapacity(capacity)
                  next.invalidSlots = []
                }
                next.amPmSelection = ''
                next.specialProgramAvailable = undefined
                return next
              }
              if (nextChoice !== 'others') {
                next.customLeaveText = ''
                const mapped = LEAVE_TYPE_FTE_MAP[nextChoice as keyof typeof LEAVE_TYPE_FTE_MAP]
                if (typeof mapped === 'number') {
                  const remain = clamp(round2(mapped), 0, capacity)
                  next.fteRemaining = remain
                  next.fteSubtraction = clamp(round2(capacity - remain), 0, capacity)
                  if (currentMember.rank === 'PCA' || currentMember.rank === 'workman' || slotBasedSharedTherapist) {
                    next.availableSlots = defaultSlotsFromCapacity(remain)
                    next.invalidSlots = []
                  }
                }
              }
              return next
            })
          }}
        >
          <SelectTrigger className="h-8 w-[148px] text-[11px] sm:text-xs [&>span]:max-w-[calc(100%-20px)] [&>span]:truncate [&>span]:whitespace-nowrap">
            <SelectValue className="truncate" placeholder="On duty" />
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
    const sharedTherapist = isSharedTherapist(member)
    const effectiveSharedTherapistMode = getEffectiveSharedTherapistModeForRow(row)
    const slotBasedSharedTherapist = sharedTherapist && effectiveSharedTherapistMode === 'slot-based'
    const showAmPm =
      !slotBasedSharedTherapist &&
      (member.rank === 'APPT' || member.rank === 'RPT') &&
      row.fteRemaining > 0 &&
      row.fteRemaining <= 0.5
    const therapistSpecialProgramUiState = getTherapistSpecialProgramUiState({
      member,
      allStaff: activeStaff,
      specialPrograms,
      weekday,
      leaveType: row.leaveChoice === '__none__'
        ? null
        : row.leaveChoice === 'others'
          ? (row.customLeaveText.trim() || 'others')
          : row.leaveChoice,
      fteRemaining: row.fteRemaining,
      fteSubtraction: row.fteSubtraction,
    })
    const specialProgramInfo = therapistSpecialProgramUiState.info
    const showSpecialProgram = therapistSpecialProgramUiState.showToggle
    return (
      <div key={row.staffId} className="py-3">
            <div className="flex items-center gap-2">
          <label className="inline-flex min-w-0 flex-wrap items-center gap-2 text-sm">
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
            {sharedTherapist ? (
              <Badge variant="outline" className={cn('select-none px-1.5 py-0.5 text-[11px] font-medium', SHARED_THERAPIST_BADGE_CLASS)} title="Shared therapist">
                Shared
              </Badge>
            ) : null}
            {specialProgramInfo ? (
              <Badge variant="outline" className={STEP1_SPECIAL_PROGRAM_BADGE_CLASS}>
                {specialProgramInfo.programName} · {specialProgramInfo.slotLabel}
              </Badge>
            ) : null}
            {member.rank === 'SPT' && (() => {
              const sptBadge = sptBadgeByStaffId.get(row.staffId)
              return sptBadge && !sptBadge.showSpecialProgramBadge ? (
                <Badge variant="outline" className={STEP1_SPT_DUTY_BADGE_CLASS}>
                  {sptBadge.label}
                </Badge>
              ) : null
            })()}
          </label>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeRow(row.staffId)} title="Remove from draft">
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>

        <div className="mt-2 flex flex-wrap items-end gap-2">
          {renderLeaveTypeSelect(row, member)}
          {renderCustomLeaveInput(row)}

          {sharedTherapist ? (
            <div className={sharedTherapistModeControlPresentation.wrapperClass}>
              <div className={sharedTherapistModeControlPresentation.topRowClass}>
                <span className={sharedTherapistModeControlPresentation.labelClass}>Mode:</span>
                <div className="inline-flex rounded border border-input overflow-hidden" role="group" aria-label={`Shared therapist mode for ${member.name}`}>
                  <button
                    type="button"
                    onClick={() => applySharedTherapistModeForDay(row, member, 'slot-based')}
                    className={cn(
                      'px-2 py-1 text-xs font-medium transition-colors',
                      effectiveSharedTherapistMode === 'slot-based'
                        ? 'bg-green-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    )}
                  >
                    Slot-based
                  </button>
                  <button
                    type="button"
                    onClick={() => applySharedTherapistModeForDay(row, member, 'single-team')}
                    className={cn(
                      'px-2 py-1 text-xs font-medium transition-colors border-l border-input',
                      effectiveSharedTherapistMode === 'single-team'
                        ? 'bg-green-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    )}
                  >
                    Single-team
                  </button>
                </div>
              </div>

              <div className={sharedTherapistModeControlPresentation.metaRowClass}>
                <span className={sharedTherapistModeControlPresentation.metaTextClass}>
                  Dashboard default: {row.sharedTherapistBaseMode === 'slot-based' ? 'Slot-based' : 'Single-team'}
                </span>
                {row.sharedTherapistModeOverride ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className={sharedTherapistModeControlPresentation.resetButtonClass}
                    onClick={() => applySharedTherapistModeForDay(row, member, undefined)}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Reset
                  </Button>
                ) : (
                  <span className={sharedTherapistModeControlPresentation.metaTextClass}>
                    Using dashboard default
                  </span>
                )}
              </div>
            </div>
          ) : null}

          {member.rank === 'SPT' ? (
            <div className="ml-4 flex flex-wrap items-end gap-1.5">
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Base FTE</Label>
                <Input
                  className="h-8 w-[70px]"
                  value={getFteInput(row.staffId, 'sptBaseFTE', row.sptBaseFTE)}
                  onChange={(e) => setFteInput(row.staffId, 'sptBaseFTE', e.target.value)}
                  onBlur={(e) => {
                    const parsed = Number.parseFloat(e.target.value)
                    const base = Number.isFinite(parsed) ? clamp(round2(parsed), 0, 1) : row.sptBaseFTE
                    setRow(row.staffId, (current) => {
                      const leaveCost = clamp(current.fteSubtraction, 0, base)
                      const remaining = clamp(round2(base - leaveCost), 0, base)
                      syncFteInputs(row.staffId, { sptBaseFTE: base, fteSubtraction: leaveCost, fteRemaining: remaining })
                      return { ...current, sptBaseFTE: base, fteSubtraction: leaveCost, fteRemaining: remaining }
                    })
                  }}
                />
              </div>
              <span className="text-muted-foreground pb-2 text-sm">−</span>
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Leave cost</Label>
                <Input
                  className="h-8 w-[70px]"
                  value={getFteInput(row.staffId, 'fteSubtraction', row.fteSubtraction)}
                  onChange={(e) => setFteInput(row.staffId, 'fteSubtraction', e.target.value)}
                  onBlur={(e) => {
                    const parsed = Number.parseFloat(e.target.value)
                    const leaveCost = Number.isFinite(parsed) ? clamp(round2(parsed), 0, row.sptBaseFTE) : row.fteSubtraction
                    setRow(row.staffId, (current) => {
                      const remaining = clamp(round2(current.sptBaseFTE - leaveCost), 0, current.sptBaseFTE)
                      syncFteInputs(row.staffId, { fteSubtraction: leaveCost, fteRemaining: remaining })
                      return { ...current, fteSubtraction: leaveCost, fteRemaining: remaining }
                    })
                  }}
                />
              </div>
              <span className="text-muted-foreground pb-2 text-sm">=</span>
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">FTE remaining</Label>
                <Input
                  className="h-8 w-[70px]"
                  value={getFteInput(row.staffId, 'fteRemaining', row.fteRemaining)}
                  onChange={(e) => setFteInput(row.staffId, 'fteRemaining', e.target.value)}
                  onBlur={(e) => {
                    const parsed = Number.parseFloat(e.target.value)
                    const remaining = Number.isFinite(parsed) ? clamp(round2(parsed), 0, row.sptBaseFTE) : row.fteRemaining
                    setRow(row.staffId, (current) => {
                      const leaveCost = clamp(round2(current.sptBaseFTE - remaining), 0, current.sptBaseFTE)
                      syncFteInputs(row.staffId, { fteRemaining: remaining, fteSubtraction: leaveCost })
                      return { ...current, fteRemaining: remaining, fteSubtraction: leaveCost }
                    })
                  }}
                />
              </div>
            </div>
          ) : slotBasedSharedTherapist ? (
            <div className="ml-4 flex flex-wrap items-end gap-2">
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">A/V slots</Label>
                <div className="flex gap-1">
                  {SLOT_OPTIONS.map((slot) => {
                    const selected = row.availableSlots.includes(slot)
                    return (
                      <Button
                        key={`${row.staffId}-shared-slot-${slot}`}
                        type="button"
                        variant="outline"
                        size="sm"
                        className={cn('h-8 min-w-8 px-2', selected && 'bg-blue-600 text-white hover:bg-blue-600 hover:text-white')}
                        onClick={() => {
                          setRow(row.staffId, (current) => {
                            const has = current.availableSlots.includes(slot)
                            const nextSlots = has
                              ? current.availableSlots.filter((item) => item !== slot)
                              : [...current.availableSlots, slot].sort((a, b) => a - b)
                            const nextRemaining = clamp(round2(nextSlots.length * 0.25), 0, 1)
                            syncFteInputs(row.staffId, {
                              fteRemaining: nextRemaining,
                              fteSubtraction: clamp(round2(1 - nextRemaining), 0, 1),
                            })
                            return {
                              ...current,
                              availableSlots: nextSlots,
                              invalidSlots: [],
                              fteRemaining: nextRemaining,
                              fteSubtraction: clamp(round2(1 - nextRemaining), 0, 1),
                              amPmSelection: '',
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
          ) : (
            <div className="ml-4 flex flex-wrap items-end gap-1.5">
              <span className="text-muted-foreground pb-2 text-sm font-medium">1</span>
              <span className="text-muted-foreground pb-2 text-sm">−</span>
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Leave cost</Label>
                <Input
                  className="h-8 w-[70px]"
                  value={getFteInput(row.staffId, 'fteSubtraction', row.fteSubtraction)}
                  onChange={(e) => setFteInput(row.staffId, 'fteSubtraction', e.target.value)}
                  onBlur={(e) => {
                    const parsed = Number.parseFloat(e.target.value)
                    const subtraction = Number.isFinite(parsed) ? clamp(round2(parsed), 0, 1) : row.fteSubtraction
                    const value = clamp(round2(1 - subtraction), 0, 1)
                    setRow(row.staffId, (current) => ({
                      ...current,
                      fteSubtraction: subtraction,
                      fteRemaining: value,
                      amPmSelection: value > 0 && value <= 0.5 ? current.amPmSelection : '',
                    }))
                    syncFteInputs(row.staffId, { fteSubtraction: subtraction, fteRemaining: value })
                  }}
                />
              </div>
              <span className="text-muted-foreground pb-2 text-sm">=</span>
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">FTE remaining</Label>
                <Input
                  className="h-8 w-[70px]"
                  value={getFteInput(row.staffId, 'fteRemaining', row.fteRemaining)}
                  onChange={(e) => setFteInput(row.staffId, 'fteRemaining', e.target.value)}
                  onBlur={(e) => {
                    const parsed = Number.parseFloat(e.target.value)
                    const value = Number.isFinite(parsed) ? clamp(round2(parsed), 0, 1) : row.fteRemaining
                    const subtraction = clamp(round2(1 - value), 0, 1)
                    setRow(row.staffId, (current) => ({
                      ...current,
                      fteRemaining: value,
                      fteSubtraction: subtraction,
                      amPmSelection: value > 0 && value <= 0.5 ? current.amPmSelection : '',
                    }))
                    syncFteInputs(row.staffId, { fteRemaining: value, fteSubtraction: subtraction })
                  }}
                />
              </div>
            </div>
          )}

          {showAmPm ? (
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">AM/PM (when ≤0.5)</Label>
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
            <label className="inline-flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={row.specialProgramAvailable === true}
                onChange={(event) => setRow(row.staffId, (current) => ({ ...current, specialProgramAvailable: event.target.checked }))}
              />
              Still available for <strong className="font-semibold">{specialProgramInfo?.programName}</strong> slot{' '}
              <strong className="font-semibold whitespace-nowrap">{specialProgramInfo?.slotLabel}</strong> despite leave?
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
    const canShowPartialPresencePanel = row.availableSlots.length > 0 && unavailableSlots.length > 0
    const hasPartialPresence = row.invalidSlots.length > 0
    const isPartialPresenceOpen = partialPresenceOpenById[row.staffId] ?? hasPartialPresence
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

        <div className={cn('mt-2 grid gap-3', canShowPartialPresencePanel ? 'xl:grid-cols-[auto_minmax(0,340px)] xl:items-end xl:justify-start' : null)}>
          <div className="min-w-0 flex flex-wrap items-end gap-2">
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
                            invalidSlots: nextSlots.length === 0
                              ? []
                              : current.invalidSlots.filter((entry) => nextUnavailable.includes(entry.slot as 1 | 2 | 3 | 4)),
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

          {canShowPartialPresencePanel ? (
            <div className="min-w-0">
              <label className="inline-flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={isPartialPresenceOpen}
                  onChange={() => setPartialPresenceOpenById((prev) => ({ ...prev, [row.staffId]: !isPartialPresenceOpen }))}
                  className="h-4 w-4"
                />
                <span className="text-[11px] font-medium text-muted-foreground">
                  Slots with partial presence?{hasPartialPresence ? ` (${row.invalidSlots.length})` : ''}
                </span>
              </label>
              <AnimatePresence initial={false}>
                {isPartialPresenceOpen ? (
                  <motion.div
                    key="partial-presence-panel"
                    initial={{ opacity: 0, scaleY: 0 }}
                    animate={{ opacity: 1, scaleY: 1 }}
                    exit={{ opacity: 0, scaleY: 0 }}
                    transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                    style={{ transformOrigin: 'top' }}
                    className="mt-2 space-y-2"
                  >
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
                                <div className="flex justify-end gap-2 mt-3">
                                  <PopoverClose asChild>
                                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label="Dismiss">
                                      <X className="h-4 w-4" />
                                    </Button>
                                  </PopoverClose>
                                  <PopoverClose asChild>
                                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label="Confirm">
                                      <Check className="h-4 w-4" />
                                    </Button>
                                  </PopoverClose>
                                </div>
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
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
          ) : null}
        </div>
      </div>
    )
  }

  const renderSectionDivider = () => (
    <div className="my-4 border-t-2 border-border" aria-hidden />
  )

  const renderRankSections = ({
    sections,
    emptyMessage,
    renderRow,
  }: {
    sections: Array<{ key: string; label: string; rows: DraftRow[]; note?: string }>
    emptyMessage: string
    renderRow: (row: DraftRow) => ReactNode
  }) => {
    const visibleSections = sections.filter((section) => section.rows.length > 0)
    if (visibleSections.length === 0) {
      return <p className="py-6 text-center text-xs text-muted-foreground">{emptyMessage}</p>
    }
    return (
      <>
        {visibleSections.map((section, index) => (
          <div key={section.key}>
            {index > 0 ? renderSectionDivider() : null}
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <Badge variant="outline" className={cn('select-none px-1.5 py-0.5 text-[11px] font-medium', RANK_BADGE_NEUTRAL_CLASS)}>
                  {section.label}
                </Badge>
                <label className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={section.rows.length > 0 && section.rows.every((row) => row.selected)}
                    onChange={(event) => setSectionSelected(section.rows, event.target.checked)}
                  />
                  Select all
                </label>
              </div>
              <div className="divide-y divide-border">
                {section.rows.map((row) => renderRow(row))}
              </div>
              {section.note ? <p className="text-[11px] text-muted-foreground">{section.note}</p> : null}
            </section>
          </div>
        ))}
      </>
    )
  }

  const therapistSections = [
    {
      key: 'spt',
      label: 'SPT',
      rows: sptRows,
      note: 'You can do final SPT leave edit later in Step 2.2 (SPT Final Edit).',
    },
    { key: 'appt', label: 'APPT', rows: apptRows },
    { key: 'rpt', label: 'RPT', rows: rptRows },
  ]

  const pcaSections = [
    { key: 'floating', label: 'Floating PCA', rows: floatingPcaRows },
    { key: 'non-floating', label: 'Non-floating PCA', rows: nonFloatingPcaRows },
  ]

  const therapistSection = (
    <div className="space-y-3">
      <div className="flex items-center gap-2 overflow-x-auto border-b border-border pb-3">
        <div className="shrink-0 text-sm text-muted-foreground">Bulk actions</div>
        <div className="flex flex-nowrap items-center gap-2">
          <Select value={bulkLeaveTherapist} onValueChange={(value) => setBulkLeaveTherapist(value as LeaveChoice)}>
            <SelectTrigger className="h-8 w-[120px] shrink-0 text-[11px] sm:w-[148px] sm:text-xs [&>span]:max-w-[calc(100%-20px)] [&>span]:truncate [&>span]:whitespace-nowrap">
              <SelectValue className="truncate" placeholder="Set leave type" />
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
            className="shrink-0"
            disabled={selectedTherapistCount === 0}
            onClick={() => applyBulkLeaveChoice('therapist', bulkLeaveTherapist)}
          >
            <span className="sm:hidden">Apply</span>
            <span className="hidden sm:inline">Apply leave type</span>
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="shrink-0"
            disabled={selectedTherapistCount === 0}
            onClick={() => clearSelectedRows('therapist')}
          >
            <span className="sm:hidden">Clear</span>
            <span className="hidden sm:inline">Clear fields</span>
          </Button>
          {isDraftDirty ? (
            <Button type="button" size="sm" variant="ghost" className="shrink-0" onClick={resetDraft}>
              <RotateCcw className="mr-1 h-3.5 w-3.5" />
              Reset draft
            </Button>
          ) : null}
        </div>
      </div>

      <div className="max-h-none overflow-visible overscroll-contain pr-1 sm:max-h-[420px] sm:overflow-y-auto">
        {renderRankSections({
          sections: therapistSections,
          emptyMessage: 'No therapist rows in draft.',
          renderRow: (row) => {
            const member = staffById.get(row.staffId)
            return member ? renderTherapistRow(row, member) : null
          },
        })}
      </div>
    </div>
  )

  const pcaSection = (
    <div className="space-y-3">
      <div className="flex items-center gap-2 overflow-x-auto border-b border-border pb-3">
        <div className="shrink-0 text-sm text-muted-foreground">Bulk actions</div>
        <div className="flex flex-nowrap items-center gap-2">
          <Select value={bulkLeavePca} onValueChange={(value) => setBulkLeavePca(value as LeaveChoice)}>
            <SelectTrigger className="h-8 w-[120px] shrink-0 text-[11px] sm:w-[148px] sm:text-xs [&>span]:max-w-[calc(100%-20px)] [&>span]:truncate [&>span]:whitespace-nowrap">
              <SelectValue className="truncate" placeholder="Set leave type" />
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
            className="shrink-0"
            disabled={selectedPcaCount === 0}
            onClick={() => applyBulkLeaveChoice('pca', bulkLeavePca)}
          >
            <span className="sm:hidden">Apply</span>
            <span className="hidden sm:inline">Apply leave type</span>
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="shrink-0"
            disabled={selectedPcaCount === 0}
            onClick={() => clearSelectedRows('pca')}
          >
            <span className="sm:hidden">Clear</span>
            <span className="hidden sm:inline">Clear fields</span>
          </Button>
          {isDraftDirty ? (
            <Button type="button" size="sm" variant="ghost" className="shrink-0" onClick={resetDraft}>
              <RotateCcw className="mr-1 h-3.5 w-3.5" />
              Reset draft
            </Button>
          ) : null}
        </div>
      </div>

      <div className="max-h-none overflow-visible overscroll-contain pr-1 sm:max-h-[420px] sm:overflow-y-auto">
        {renderRankSections({
          sections: pcaSections,
          emptyMessage: 'No PCA rows in draft.',
          renderRow: (row) => {
            const member = staffById.get(row.staffId)
            return member ? renderPcaRow(row, member) : null
          },
        })}
      </div>
    </div>
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] w-[calc(100vw-24px)] max-w-5xl flex-col overflow-hidden">
        {/* Step 1 stepper — wide: top-right; narrow: under instruction (see DialogDescription) */}
        <div className="absolute right-3 top-3 hidden sm:flex sm:right-4 sm:top-4 items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {[
              { step: '1.1', label: 'Add' },
              { step: '1.2', label: 'Therapist' },
              { step: '1.3', label: 'PCA' },
              { step: '1.4', label: 'Review' },
            ].map(({ step, label }, i) => (
              <Fragment key={step}>
                {i > 0 ? <span aria-hidden="true">·</span> : null}
                <span
                  className={cn(
                    'px-2.5 py-1 rounded-md',
                    wizardStep === step && 'bg-slate-100 dark:bg-slate-700 font-semibold text-primary'
                  )}
                >
                  {step} {label}
                </span>
              </Fragment>
            ))}
          </div>
          {wizardStep === '1.3' ? (
            <Popover>
              <PopoverTrigger asChild>
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label="Step 1.3 terms help">
                  <CircleHelp className="h-4 w-4 text-muted-foreground" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-[320px] rounded-md border border-border bg-white p-3 shadow-md">
                <div className="space-y-2 text-xs">
                  <div className="font-medium text-foreground">Step 1.3 terms</div>
                  <p className="text-muted-foreground">
                    <span className="font-medium text-foreground">A/V slots</span>: fully present in the selected slot. Each selected slot counts as{' '}
                    <span className="font-medium text-foreground">0.25 FTE</span>.
                  </p>
                  <p className="text-muted-foreground">
                    <span className="font-medium text-foreground">Slots with partial presence</span>: partial attendance windows for unavailable slots. These
                    notes do <span className="font-medium text-foreground">not</span> add FTE.
                  </p>
                </div>
              </PopoverContent>
            </Popover>
          ) : null}
        </div>

        <DialogHeader className="pr-4 sm:pr-32">
          <DialogTitle>Leave setup</DialogTitle>
          <DialogDescription>
            <span className="block text-xs text-muted-foreground">
              {wizardStep === '1.1' ? 'Step 1.1 · Add'
                : wizardStep === '1.2' ? 'Step 1.2 · Therapist'
                : wizardStep === '1.3' ? 'Step 1.3 · PCA'
                : 'Step 1.4 · Review'}
            </span>
            <span className="mt-1 block">
              {wizardStep === '1.1'
                ? 'Draft is auto-loaded from the source/copied schedule. Review the following list before proceeding to edit leave and FTE.'
                : null}
              {wizardStep === '1.2'
                ? 'Edit therapist leave and FTE on-duty.'
                : null}
              {wizardStep === '1.3'
                ? 'Edit PCA available slots and partial presence. FTE remaining is derived from available slots.'
                : null}
              {wizardStep === '1.4' ? 'Preview today’s leave setup before saving.' : null}
            </span>
            {/* Narrow: stepper under instruction */}
            <div className="mt-3 flex sm:hidden flex-wrap items-center justify-center gap-2 text-xs text-muted-foreground">
              {[
                { step: '1.1', label: 'Add' },
                { step: '1.2', label: 'Therapist' },
                { step: '1.3', label: 'PCA' },
                { step: '1.4', label: 'Review' },
              ].map(({ step, label }, i) => (
                <Fragment key={step}>
                  {i > 0 ? <span aria-hidden="true">·</span> : null}
                  <span
                    className={cn(
                      'px-2.5 py-1 rounded-md',
                      wizardStep === step && 'bg-slate-100 dark:bg-slate-700 font-semibold text-primary'
                    )}
                  >
                    {step} {label}
                  </span>
                </Fragment>
              ))}
              {wizardStep === '1.3' ? (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" aria-label="Step 1.3 terms help">
                      <CircleHelp className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-[320px] rounded-md border border-border bg-white p-3 shadow-md">
                    <div className="space-y-2 text-xs">
                      <div className="font-medium text-foreground">Step 1.3 terms</div>
                      <p className="text-muted-foreground">
                        <span className="font-medium text-foreground">A/V slots</span>: fully present in the selected slot. Each selected slot counts as{' '}
                        <span className="font-medium text-foreground">0.25 FTE</span>.
                      </p>
                      <p className="text-muted-foreground">
                        <span className="font-medium text-foreground">Slots with partial presence</span>: partial attendance windows for unavailable slots. These
                        notes do <span className="font-medium text-foreground">not</span> add FTE.
                      </p>
                    </div>
                  </PopoverContent>
                </Popover>
              ) : null}
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-auto overscroll-contain pr-1 pb-3 pt-4">
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

                {/* Mobile: keep box; lg+: flat with top/bottom rules only */}
                <div className="rounded-md border border-border overflow-hidden lg:rounded-none lg:border-0 lg:border-t lg:border-b lg:overflow-visible">
                  <div className="grid gap-0 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,0.6fr)] lg:divide-x divide-border items-stretch">
                    {/* Left: pickers */}
                    <div
                      className={cn(
                        'h-[420px] min-h-0 flex-col',
                        step11Pane === 'add' ? 'flex' : 'hidden',
                        'lg:flex'
                      )}
                    >
                      {/* Mobile: boxed header with border-b; lg+: plain label, no border-b */}
                      <div className="px-3 py-2 text-xs font-semibold text-muted-foreground border-b border-border flex items-center justify-between gap-2 lg:border-b-0 lg:pb-1">
                        <span>Add staff</span>
                        {renderStep11PaneSwitch()}
                      </div>
                      <div className="min-h-0 flex-1">
                        {/* Mobile: gap-px bg-border cells; lg+: divide-x divide-y, no fill colour */}
                        <div className="grid h-full grid-cols-2 grid-rows-2 gap-px bg-border xl:grid-cols-4 xl:grid-rows-1 lg:gap-0 lg:bg-transparent lg:divide-x lg:divide-y lg:divide-border xl:divide-y-0">
                          {(['SPT', 'APPT', 'RPT', 'PCA'] as const).map((rank) => (
                            <div key={`picker-${rank}`} className="min-h-0 flex flex-col overflow-hidden bg-background lg:bg-transparent">
                              {/* Mobile: border-b rank header; lg+: plain label */}
                              <div className="px-2 py-1.5 border-b border-border flex items-center gap-2 lg:border-b-0 lg:pb-0.5">
                                <Badge variant="outline" className={cn('select-none px-1.5 py-0.5 text-[11px] font-medium', RANK_BADGE_NEUTRAL_CLASS)}>
                                  {rank}
                                </Badge>
                              </div>
                              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2 space-y-1">
                                {filteredPickers[rank].map((member) => {
                                  const exists = rowIds.has(member.id)
                                  const specialProgramInfo = therapistSpecialProgramInfoByStaffId.get(member.id) ?? null
                                  const sptBadge = member.rank === 'SPT' ? sptBadgeByStaffId.get(member.id) : null
                                  const showSpecialProgramBadge =
                                    sptBadge?.showSpecialProgramBadge === true ||
                                    (specialProgramInfo != null && sptBadge == null)
                                  return (
                                    <div
                                      key={member.id}
                                      className={cn(
                                        'flex items-center justify-between gap-2 rounded px-1 py-1',
                                        exists ? 'bg-muted ring-1 ring-border' : 'hover:bg-muted/20'
                                      )}
                                    >
                                      <div className="min-w-0 flex items-center gap-2 flex-wrap">
                                        <div className="min-w-0 flex items-center gap-2">
                                          <span className="truncate text-xs" title={member.name}>
                                            {member.name}
                                          </span>
                                          <span className="text-[10px] text-muted-foreground">{member.team ?? '--'}</span>
                                        </div>
                                        {showSpecialProgramBadge && specialProgramInfo ? (
                                          <Badge variant="outline" className={STEP1_SPECIAL_PROGRAM_BADGE_CLASS}>
                                            {specialProgramInfo.programName} · {specialProgramInfo.slotLabel}
                                          </Badge>
                                        ) : sptBadge && !sptBadge.showSpecialProgramBadge ? (
                                          <Badge variant="outline" className={STEP1_SPT_DUTY_BADGE_CLASS}>
                                            {sptBadge.label}
                                          </Badge>
                                        ) : null}
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
                    <div
                      className={cn(
                        'h-[420px] min-h-0 flex-col',
                        step11Pane === 'draft' ? 'flex' : 'hidden',
                        'lg:flex'
                      )}
                    >
                      {/* Mobile: boxed header with border-b; lg+: plain label, no border-b */}
                      <div className="px-3 py-2 border-b border-border flex items-center justify-between gap-2 lg:border-b-0 lg:pb-1">
                        <div>
                          <span className="text-xs font-semibold text-muted-foreground">Draft list</span>
                          <p className="text-[10px] text-muted-foreground/70 mt-0.5">Leave type and FTE are editable in the next steps.</p>
                        </div>
                        {renderStep11PaneSwitch()}
                      </div>
                      <div className="min-h-0 flex-1 overflow-y-auto py-1">
                        {rows.length === 0 ? (
                          <p className="py-4 text-center text-xs text-muted-foreground">No staff in draft yet.</p>
                        ) : (
                          <div className="divide-y divide-border">
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
                              return (
                                <div
                                  key={`draft-preview-${row.staffId}`}
                                  className="flex items-center justify-between px-3 py-1.5 hover:bg-muted/30"
                                >
                                  <div className="min-w-0">
                                    <div className="truncate text-xs font-medium">{member.name}</div>
                                    <div className="truncate text-[11px] text-muted-foreground">
                                      {member.rank} · {member.team ?? '--'}
                                    </div>
                                  </div>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 shrink-0"
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
                <div className="rounded-md border border-border overflow-hidden divide-y divide-border lg:divide-y-0 lg:grid lg:grid-cols-2 lg:gap-px lg:bg-border">
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
                      const effectiveSharedMode = row.sharedTherapistModeOverride ?? row.sharedTherapistBaseMode
                      const isSlotBasedShared = isSharedTherapist(member) && effectiveSharedMode === 'slot-based'
                      const showSlotBasedSharedSlots = isSlotBasedShared && (avSlots.length > 0 || partial.length > 0)
                      return (
                        <div key={`preview-${row.staffId}`} className="flex items-center justify-between px-3 py-2 hover:bg-muted/30 bg-background">
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
                              ) : isSharedTherapist(member) ? (
                                <Badge variant="outline" className={cn('select-none px-1.5 py-0.5 text-[10px] font-medium', SHARED_THERAPIST_BADGE_CLASS)} title="Shared therapist">
                                  Shared
                                </Badge>
                              ) : member.rank === 'SPT' ? null : (
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    'select-none px-1.5 py-0.5 text-[10px] font-medium',
                                    getTeamBadgeClass(member.team as any)
                                  )}
                                >
                                  {member.team ?? '--'}
                                </Badge>
                              )}
                            </div>
                            <div className="truncate text-[11px] text-muted-foreground">{leavePreview}</div>
                            {(showPcaDetails || showSlotBasedSharedSlots) ? (
                              <div className="mt-1 text-[11px] text-muted-foreground">
                                {avSlots.length > 0 ? `Available slots: ${avSlots.join(', ')}` : 'Available slots: —'}
                                {partial.length > 0
                                  ? ` · Partial presence: ${partial.map((p) => `Slot ${p.slot} ${p.timeRange.start}-${p.timeRange.end}`).join(', ')}`
                                  : ''}
                              </div>
                            ) : null}
                          </div>
                          <div className="text-xs text-muted-foreground shrink-0 pl-3">FTE {finalEdit.fteRemaining.toFixed(2)}</div>
                        </div>
                      )
                    })}
                </div>
              )}
            </div>
          ) : null}
        </div>

        {saveError ? <p className="text-sm text-destructive">{saveError}</p> : null}

        <DialogFooter className={NARROW_VIEWPORT_FOOTER_CLASS}>
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
            <Button type="button" onClick={handleSave} disabled={saving} className="shrink min-w-0 truncate">
              {saving ? 'Saving...' : <><span className="sm:hidden">Save</span><span className="hidden sm:inline">Save & Apply to Step 1</span></>}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

