'use client'

import dynamic from 'next/dynamic'
import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from 'react'
import type { Team, Weekday, LeaveType, Staff, SharedTherapistAllocationMode } from '@/types/staff'
import type {
  PCAAllocation,
  TherapistAllocation,
  BedCountsOverridePayload,
  BedCountsOverrideState,
  BedCountsWardRow,
  StepStatus,
} from '@/types/schedule'
import type { SpecialProgram, SPTAllocation, PCAPreference } from '@/types/allocation'
import type { PCAData, FloatingPCAAllocationResultV2 } from '@/lib/algorithms/pcaAllocation'
import type { SlotAssignment } from '@/lib/utils/reservationLogic'
import type { Step2ResultSurplusProjectionForStep3 } from '@/lib/features/schedule/schedulePageFingerprints'
import type { SharedTherapistSlotTeams } from '@/lib/features/schedule/sharedTherapistStep'
import type { BedCountsOverridesByTeam, ScheduleWardRow } from '@/lib/features/schedule/controller/scheduleControllerTypes'
import type { Step3BootstrapSummary, Step3ProjectionV2 } from '@/lib/features/schedule/step3Bootstrap'
import { formatWardLabel } from '@/lib/features/schedule/bedMath'
import { TEAMS } from '@/lib/features/schedule/constants'
import { getWeekday } from '@/lib/features/schedule/date'
import { BedCountsEditDialog } from '@/features/schedule/ui/allocation/BedCountsEditDialog'
import { ScheduleDialogsLayer } from '@/features/schedule/ui/overlays/ScheduleDialogsLayer'

const ScheduleCopyWizard = dynamic(
  () => import('@/components/allocation/ScheduleCopyWizard').then((m) => m.ScheduleCopyWizard),
  { ssr: false }
)
const StaffEditDialog = dynamic(
  () => import('@/components/allocation/StaffEditDialog').then((m) => m.StaffEditDialog),
  { ssr: false }
)
const Step1LeaveSetupDialog = dynamic(
  () => import('@/components/allocation/Step1LeaveSetupDialog').then((m) => m.Step1LeaveSetupDialog),
  { ssr: false }
)
const FloatingPCAEntryDialog = dynamic(
  () =>
    import('@/features/schedule/ui/steps/step3-floating/substeps/step30-entry-flow/FloatingPCAEntryDialog').then(
      (m) => m.FloatingPCAEntryDialog
    ),
  { ssr: false }
)
const FloatingPCAConfigDialogV1 = dynamic(
  () =>
    import('@/features/schedule/ui/steps/step3-floating/FloatingPCAConfigDialogV1').then(
      (m) => m.FloatingPCAConfigDialogV1
    ),
  { ssr: false }
)
const FloatingPCAConfigDialogV2 = dynamic(
  () =>
    import('@/features/schedule/ui/steps/step3-floating/FloatingPCAConfigDialogV2').then(
      (m) => m.FloatingPCAConfigDialogV2
    ),
  { ssr: false }
)
const NonFloatingSubstitutionDialog = dynamic(
  () => import('@/components/allocation/NonFloatingSubstitutionDialog').then((m) => m.NonFloatingSubstitutionDialog),
  { ssr: false }
)
const TieBreakDialog = dynamic(
  () => import('@/components/allocation/TieBreakDialog').then((m) => m.TieBreakDialog),
  { ssr: false }
)
const SpecialProgramOverrideDialog = dynamic(
  () => import('@/components/allocation/SpecialProgramOverrideDialog').then((m) => m.SpecialProgramOverrideDialog),
  { ssr: false }
)
const SptFinalEditDialog = dynamic(
  () => import('@/components/allocation/SptFinalEditDialog').then((m) => m.SptFinalEditDialog),
  { ssr: false }
)
const SharedTherapistEditDialog = dynamic(
  () => import('@/components/allocation/SharedTherapistEditDialog').then((m) => m.SharedTherapistEditDialog),
  { ssr: false }
)
const ScheduleCalendarPopover = dynamic(
  () => import('@/features/schedule/ui/overlays/ScheduleCalendarPopover').then((m) => m.ScheduleCalendarPopover),
  { ssr: false }
)

export type SpecialProgramOverrideEntry = {
  programId: string
  enabled?: boolean
  therapistId?: string
  pcaId?: string
  slots?: number[]
  requiredSlots?: number[]
  therapistFTESubtraction?: number
  pcaFTESubtraction?: number
  drmAddOn?: number
}

export type SptFinalEditUpdate = {
  leaveType: LeaveType | null
  fteSubtraction: number
  fteRemaining: number
  team?: Team
  sptOnDayOverride: {
    enabled: boolean
    contributesFte: boolean
    slots: number[]
    slotModes: { am: 'AND' | 'OR'; pm: 'AND' | 'OR' }
    displayText?: string | null
    assignedTeam?: Team | null
  }
}

export type SharedTherapistEditUpdate = {
  leaveType: LeaveType | null
  fteRemaining: number
  sharedTherapistModeOverride?: SharedTherapistAllocationMode
  team?: Team
  therapistTeamFTEByTeam?: Partial<Record<Team, number>>
  sharedTherapistSlotTeams?: SharedTherapistSlotTeams
}

export type SharedTherapistDialogCurrentAllocation = {
  teamFteByTeam: Partial<Record<Team, number>>
  slotTeamBySlot: SharedTherapistSlotTeams
} | null

export type SharedTherapistDialogData = {
  sharedTherapists: Staff[]
  staffOverrides: Record<string, any>
  currentAllocationByStaffId: Record<string, SharedTherapistDialogCurrentAllocation>
  ptPerTeamByTeam: Record<Team, number>
}

export type Step1BulkEditPayload = {
  staffId: string
  leaveType: LeaveType | null
  fteRemaining: number
  sharedTherapistModeOverride?: SharedTherapistAllocationMode
  fteSubtraction?: number
  availableSlots?: number[]
  invalidSlots?: Array<{ slot: number; timeRange: { start: string; end: string } }>
  amPmSelection?: 'AM' | 'PM'
  specialProgramAvailable?: boolean
}

export type ScheduleSubstitutionWizardSubstitutionRow = {
  nonFloatingPCAId: string
  nonFloatingPCAName: string
  team: Team
  fte: number
  missingSlots: number[]
  availableFloatingPCAs: Array<{
    id: string
    name: string
    availableSlots: number[]
    isPreferred: boolean
    isFloorPCA: boolean
    blockedSlotsInfo?: Array<{ slot: number; reasons: string[] }>
  }>
}

export type ScheduleSubstitutionWizardDisplayData = {
  teams: Team[]
  substitutionsByTeam: Record<Team, ScheduleSubstitutionWizardSubstitutionRow[]>
  isWizardMode: boolean
  initialSelections?: Record<string, Array<{ floatingPCAId: string; slots: number[] }>>
  allowBackToSpecialPrograms?: boolean
}

export type ScheduleFloatingPcaDialogBundle = {
  floatingPCAEntryOpen: boolean
  floatingPCAConfigV1Open: boolean
  floatingPCAConfigV2Open: boolean
  prefetchFloatingPCAConfigDialogV1: () => Promise<unknown>
  prefetchFloatingPCAConfigDialogV2: () => Promise<unknown>
  openStep3V1Dialog: () => void
  openStep3V2Dialog: () => void
  handleFloatingPCAConfigCancel: () => void
  handleFloatingPCAConfigSave: (
    result: FloatingPCAAllocationResultV2,
    teamOrder: Team[],
    step32Assignments: SlotAssignment[],
    step33Assignments: SlotAssignment[]
  ) => void | Promise<void>
  visibleTeams: Team[]
  selectedDate: Date
  pendingPCAFTEForStep3Dialog: Record<Team, number>
  pcaPreferences: PCAPreference[] | null | undefined
  floatingPCAsForStep3: PCAData[]
  existingAllocationsForStep3Dialog: PCAAllocation[]
  specialPrograms: SpecialProgram[] | null | undefined
  bufferStaff: Staff[]
  staffOverrides: Record<string, unknown>
  step3BootstrapSummary: Step3BootstrapSummary
  step3ProjectionV2: Step3ProjectionV2
  step2Result: Step2ResultSurplusProjectionForStep3 | null
  reservedSpecialProgramPcaFteForStep3: number
  staff: Staff[]
}

/** Round 3 R3-28: resolver refs wired with Step 2 / Step 3 dialog promises — keep grouped with consumers. */
export type SchedulePageDialogResolversProps = {
  tieBreakResolverRef: MutableRefObject<((team: Team) => void) | null>
  specialProgramOverrideResolverRef: MutableRefObject<
    ((overrides: Record<string, { specialProgramOverrides?: SpecialProgramOverrideEntry[] }> | null) => void) | null
  >
  sptFinalEditResolverRef: MutableRefObject<((updates: Record<string, SptFinalEditUpdate> | null) => void) | null>
  sharedTherapistEditResolverRef: MutableRefObject<
    ((updates: Record<string, SharedTherapistEditUpdate> | null) => void) | null
  >
  substitutionWizardResolverRef: MutableRefObject<
    ((selections: Record<string, Array<{ floatingPCAId: string; slots: number[] }>>) => void) | null
  >
}

export type SchedulePageDialogStep1AndStaffProps = {
  editingBedTeam: Team | null
  setEditingBedTeam: (team: Team | null) => void
  wards: ScheduleWardRow[]
  bedCountsOverridesByTeam: BedCountsOverridesByTeam | null | undefined
  captureUndoCheckpoint: (label: string) => void
  setBedCountsOverridesByTeam: Dispatch<SetStateAction<BedCountsOverridesByTeam>>
  setStepStatus: Dispatch<SetStateAction<Record<string, StepStatus>>>
  step1LeaveSetupOpen: boolean
  setStep1LeaveSetupOpen: (open: boolean) => void
  staff: Staff[]
  staffOverrides: Record<string, unknown>
  specialPrograms: SpecialProgram[] | null | undefined
  sptAllocations: SPTAllocation[]
  currentWeekday: Weekday
  handleSaveStep1LeaveSetup: (args: { edits: Step1BulkEditPayload[] }) => void | Promise<void>
  editingStaffId: string | null
  therapistAllocations: Record<Team, (TherapistAllocation & { staff: Staff })[]>
  pcaAllocationsForUi: Record<Team, PCAAllocation[]>
  editDialogOpen: boolean
  setEditDialogOpen: (open: boolean) => void
  handleSaveStaffEdit: (...args: any[]) => void | Promise<void>
}

export type SchedulePageDialogCopyWizardProps = {
  copyWizardConfig: {
    sourceDate: Date
    targetDate: Date | null
    flowType: 'next-working-day' | 'last-working-day' | 'specific-date'
    direction: 'to' | 'from'
  } | null
  copyWizardOpen: boolean
  setCopyWizardOpen: (open: boolean) => void
  setCopyWizardConfig: Dispatch<
    SetStateAction<{
      sourceDate: Date
      targetDate: Date | null
      flowType: 'next-working-day' | 'last-working-day' | 'specific-date'
      direction: 'to' | 'from'
    } | null>
  >
  handleConfirmCopy: (params: {
    fromDate: Date
    toDate: Date
    includeBufferStaff: boolean
  }) => Promise<void | { copiedUpToStep?: string }>
  datesWithData: Set<string>
  holidays: Map<string, string>
}

export type SchedulePageDialogStep2DialogsProps = {
  tieBreakDialogOpen: boolean
  setTieBreakDialogOpen: (open: boolean) => void
  tieBreakTeams: Team[]
  tieBreakPendingFTE: number
  showSpecialProgramOverrideDialog: boolean
  setShowSpecialProgramOverrideDialog: (open: boolean) => void
  inactiveStaff: Staff[]
  sptBaseFteByStaffId: Record<string, number>
  selectedDate: Date
  showStep21InStep2Stepper: boolean
  showSharedTherapistStep: boolean
  step2DownstreamImpact: { step3Outdated: boolean; step4Outdated: boolean } | null
  loadStaff: () => Promise<void>
  loadSPTAllocations: () => Promise<void>
  staff: Staff[]
  staffOverrides: Record<string, unknown>
  specialPrograms: SpecialProgram[] | null | undefined
  showSptFinalEditDialog: boolean
  setShowSptFinalEditDialog: (open: boolean) => void
  sptStaffForStep22: Staff[]
  sptWeekdayByStaffId: Record<string, unknown>
  sptTeamsByStaffIdForStep22: Record<string, unknown>
  currentSptAllocationByStaffIdForStep22: Record<string, unknown>
  ptPerTeamByTeamForStep22: Record<Team, number>
  showSharedTherapistEditDialog: boolean
  setShowSharedTherapistEditDialog: (open: boolean) => void
  sharedTherapistDialogData: SharedTherapistDialogData | null
  setSharedTherapistDialogData: Dispatch<SetStateAction<SharedTherapistDialogData | null>>
  substitutionWizardOpen: boolean
  substitutionWizardDataForDisplay: ScheduleSubstitutionWizardDisplayData | null
  setSubstitutionWizardOpen: (open: boolean) => void
  setSubstitutionWizardData: Dispatch<SetStateAction<any>>
  handleSubstitutionWizardConfirm: (selections: Record<string, Array<{ floatingPCAId: string; slots: number[] }>>) => void
  handleSubstitutionWizardCancel: () => void
  handleSubstitutionWizardSkip: () => void
  pcaPreferences: PCAPreference[] | null | undefined
}

export type SchedulePageDialogCalendarAndSnapshotProps = {
  calendarOpen: boolean
  setCalendarOpen: (open: boolean) => void
  queueDateTransition: (date: Date) => void
  calendarButtonRef: RefObject<HTMLButtonElement | null>
  calendarPopoverRef: RefObject<HTMLDivElement | null>
  selectedDate: Date
  datesWithData: Set<string>
  holidays: Map<string, string>
}

export type SchedulePageDialogNodesProps = {
  resolvers: SchedulePageDialogResolversProps
  step1AndStaff: SchedulePageDialogStep1AndStaffProps
  copyWizard: SchedulePageDialogCopyWizardProps
  step2Dialogs: SchedulePageDialogStep2DialogsProps
  step3Floating: ScheduleFloatingPcaDialogBundle
  calendarAndSnapshot: SchedulePageDialogCalendarAndSnapshotProps
}

export function SchedulePageDialogNodes(props: SchedulePageDialogNodesProps) {
  const {
    tieBreakResolverRef,
    specialProgramOverrideResolverRef,
    sptFinalEditResolverRef,
    sharedTherapistEditResolverRef,
    substitutionWizardResolverRef,
  } = props.resolvers
  const s1 = props.step1AndStaff
  const cw = props.copyWizard
  const s2 = props.step2Dialogs
  const f = props.step3Floating
  const cal = props.calendarAndSnapshot

  return (
    <ScheduleDialogsLayer
      bedCountsDialog={s1.editingBedTeam && (() => {
        const team = s1.editingBedTeam

        const wardRows: BedCountsWardRow[] = s1.wards
          .filter((w) => (w.team_assignments[team] || 0) > 0)
          .map((w) => ({
            wardName: w.name,
            wardLabel: formatWardLabel(w as any, team),
            wardTotalBeds: w.total_beds,
            baselineTeamBeds: w.team_assignments[team] || 0,
          }))

        const initialOverrides = s1.bedCountsOverridesByTeam?.[team]

        return (
          <BedCountsEditDialog
            open={true}
            onOpenChange={(open) => {
              if (!open) s1.setEditingBedTeam(null)
            }}
            team={team}
            wardRows={wardRows}
            initialOverrides={initialOverrides}
            onSave={(payload: BedCountsOverridePayload) => {
              const wardBedCountsPruned: Record<string, number> = {}
              Object.entries(payload.wardBedCounts || {}).forEach(([wardName, value]) => {
                if (typeof value === 'number') wardBedCountsPruned[wardName] = value
              })

              const shs = payload.shsBedCounts ?? null
              const students = payload.studentPlacementBedCounts ?? null

              s1.captureUndoCheckpoint('Bed counts override')
              s1.setBedCountsOverridesByTeam((prev) => {
                const next: BedCountsOverridesByTeam = { ...prev }
                const hasAny =
                  Object.keys(wardBedCountsPruned).length > 0 ||
                  (typeof shs === 'number' && shs > 0) ||
                  (typeof students === 'number' && students > 0)
                if (!hasAny) {
                  delete next[team]
                  return next
                }
                next[team] = {
                  wardBedCounts: wardBedCountsPruned,
                  shsBedCounts: shs,
                  studentPlacementBedCounts: students,
                } satisfies BedCountsOverrideState
                return next
              })

              // Mark bed relieving as modified (and review as pending) since bed math changed.
              s1.setStepStatus((prev) => ({
                ...prev,
                'bed-relieving': prev['bed-relieving'] === 'completed' ? 'modified' : prev['bed-relieving'],
                review: 'pending',
              }))
            }}
          />
        )
      })()}
      step1LeaveSetupDialog={
        s1.step1LeaveSetupOpen ? (
          <Step1LeaveSetupDialog
            open={s1.step1LeaveSetupOpen}
            onOpenChange={s1.setStep1LeaveSetupOpen}
            staff={s1.staff}
            staffOverrides={s1.staffOverrides as any}
            specialPrograms={s1.specialPrograms ?? []}
            sptAllocations={s1.sptAllocations}
            weekday={s1.currentWeekday}
            onSaveDraft={s1.handleSaveStep1LeaveSetup}
          />
        ) : null
      }
      staffEditDialog={s1.editingStaffId && (() => {
        const staffMember = s1.staff.find((s) => s.id === s1.editingStaffId)
        if (!staffMember) return null

        // Find current leave type and FTE from overrides first, then allocations
        const override = (s1.staffOverrides as any)[s1.editingStaffId]
        let currentLeaveType: LeaveType | null = override ? override.leaveType : null
        let currentFTERemaining = override ? override.fteRemaining : 1.0
        let currentFTESubtraction = override?.fteSubtraction // Changed from const to let to allow reassignment
        let currentAvailableSlots = override?.availableSlots
        // NEW: Invalid slots array
        let currentInvalidSlots = override?.invalidSlots
        // NEW: AM/PM selection
        let currentAmPmSelection = override?.amPmSelection
        // NEW: Special program availability
        let currentSpecialProgramAvailable = override?.specialProgramAvailable
        // SPT-specific: dashboard-configured base FTE and current base FTE used for leave calculations
        let sptConfiguredFTE: number | undefined = undefined
        let currentSPTBaseFTE: number | undefined = undefined

        // If no override, check allocations
        if (!override) {
          // Check therapist allocations first
          for (const team of TEAMS) {
            const alloc = s1.therapistAllocations[team].find((a) => a.staff_id === s1.editingStaffId)
            if (alloc) {
              currentLeaveType = alloc.leave_type
              currentFTERemaining = alloc.fte_therapist ?? 1.0
              break
            }
          }

          // If not found in therapist allocations, check PCA allocations
          if (currentLeaveType === null && currentFTERemaining === 1.0) {
            // Find all PCA allocations for this staff member across all teams
            const allPcaAllocations = TEAMS.flatMap((team) =>
              s1.pcaAllocationsForUi[team].filter((a) => a.staff_id === s1.editingStaffId)
            )

            if (allPcaAllocations.length > 0) {
              // Use the leave type from the first allocation found
              currentLeaveType = allPcaAllocations[0].leave_type

              // For PCA: Calculate base_FTE_remaining = 1.0 - fteSubtraction for display
              const allocation = allPcaAllocations[0]
              const slotAssigned =
                (allocation as any)?.slot_assigned ?? (allocation as any)?.fte_assigned ?? 0
              currentFTERemaining =
                allocation.fte_pca ?? ((allocation.fte_remaining ?? 0) + slotAssigned)
              currentFTESubtraction = 1.0 - currentFTERemaining

              // Load invalid slot fields from allocation if not in override
              if ((allocation as any).invalid_slot !== undefined && (allocation as any).invalid_slot !== null) {
                const invalidSlot = (allocation as any).invalid_slot
                const getSlotStartTime = (slot: number): string => {
                  const ranges: Record<number, string> = { 1: '0900', 2: '1030', 3: '1330', 4: '1500' }
                  return ranges[slot] || '0900'
                }
                const getSlotEndTime = (slot: number): string => {
                  const ranges: Record<number, string> = { 1: '1030', 2: '1200', 3: '1500', 4: '1630' }
                  return ranges[slot] || '1030'
                }
                currentInvalidSlots = [
                  {
                    slot: invalidSlot,
                    timeRange: {
                      start: getSlotStartTime(invalidSlot),
                      end: getSlotEndTime(invalidSlot),
                    },
                  },
                ]
              }

              // Reconstruct available slots (all slots assigned, excluding invalid slots)
              const allSlots: number[] = []
              if (allocation.slot1) allSlots.push(1)
              if (allocation.slot2) allSlots.push(2)
              if (allocation.slot3) allSlots.push(3)
              if (allocation.slot4) allSlots.push(4)
              if (allSlots.length > 0) {
                const invalidSlotNumbers = currentInvalidSlots?.map((is: { slot: number }) => is.slot) || []
                currentAvailableSlots = allSlots.filter((s) => !invalidSlotNumbers.includes(s))
              }
            }
          }
        }

        if (staffMember.rank === 'SPT') {
          const cfg = s1.sptAllocations.find(
            (a) => a.staff_id === s1.editingStaffId && a.weekdays?.includes(s1.currentWeekday)
          )
          const cfgFTEraw = (cfg as any)?.fte_addon
          const cfgFTE =
            typeof cfgFTEraw === 'number' ? cfgFTEraw : cfgFTEraw != null ? parseFloat(String(cfgFTEraw)) : NaN
          sptConfiguredFTE = Number.isFinite(cfgFTE) ? Math.max(0, Math.min(cfgFTE, 1.0)) : 0

          const o = (s1.staffOverrides as any)[s1.editingStaffId]
          const legacyAutoFilled =
            !!o &&
            o.leaveType == null &&
            typeof o.fteSubtraction === 'number' &&
            typeof sptConfiguredFTE === 'number' &&
            Math.abs((o.fteRemaining ?? 0) - sptConfiguredFTE) < 0.01 &&
            Math.abs((o.fteSubtraction ?? 0) - (1.0 - (o.fteRemaining ?? 0))) < 0.01

          const leaveCost = legacyAutoFilled ? 0 : typeof o?.fteSubtraction === 'number' ? o.fteSubtraction : 0

          const derivedBase =
            typeof o?.fteSubtraction === 'number'
              ? (o.fteRemaining ?? (sptConfiguredFTE ?? currentFTERemaining)) + leaveCost
              : (sptConfiguredFTE ?? (o?.fteRemaining ?? currentFTERemaining))

          currentSPTBaseFTE = Math.max(0, Math.min(derivedBase, 1.0))
          currentFTESubtraction = leaveCost
          currentFTERemaining = Math.max(0, currentSPTBaseFTE - leaveCost)
        }

        return (
          <StaffEditDialog
            open={s1.editDialogOpen}
            onOpenChange={s1.setEditDialogOpen}
            staffName={staffMember.name}
            staffId={s1.editingStaffId}
            staffRank={staffMember.rank}
            currentLeaveType={currentLeaveType}
            currentFTERemaining={currentFTERemaining}
            currentFTESubtraction={currentFTESubtraction}
            sptConfiguredFTE={sptConfiguredFTE}
            currentSPTBaseFTE={currentSPTBaseFTE}
            currentAvailableSlots={currentAvailableSlots}
            currentInvalidSlots={currentInvalidSlots}
            currentAmPmSelection={currentAmPmSelection}
            currentSpecialProgramAvailable={currentSpecialProgramAvailable}
            allStaff={s1.staff}
            specialPrograms={s1.specialPrograms ?? undefined}
            weekday={s1.currentWeekday}
            onSave={s1.handleSaveStaffEdit}
          />
        )
      })()}
      tieBreakDialog={
        s2.tieBreakDialogOpen ? (
          <TieBreakDialog
            open={s2.tieBreakDialogOpen}
            teams={s2.tieBreakTeams}
            pendingFTE={s2.tieBreakPendingFTE}
            onSelect={(team) => {
              const resolver = tieBreakResolverRef.current
              if (resolver) {
                resolver(team)
                tieBreakResolverRef.current = null
              }
              s2.setTieBreakDialogOpen(false)
            }}
          />
        ) : null
      }
      copyWizardDialog={
        cw.copyWizardConfig ? (
          <ScheduleCopyWizard
            open={cw.copyWizardOpen}
            onOpenChange={(open) => {
              if (!open) {
                cw.setCopyWizardOpen(false)
                cw.setCopyWizardConfig(null)
              } else {
                cw.setCopyWizardOpen(true)
              }
            }}
            sourceDate={cw.copyWizardConfig.sourceDate}
            initialTargetDate={cw.copyWizardConfig.targetDate}
            flowType={cw.copyWizardConfig.flowType}
            direction={cw.copyWizardConfig.direction}
            datesWithData={cw.datesWithData}
            holidays={cw.holidays}
            onConfirmCopy={cw.handleConfirmCopy}
          />
        ) : null
      }
      floatingPcaDialog={
        f.floatingPCAEntryOpen || f.floatingPCAConfigV1Open || f.floatingPCAConfigV2Open ? (
          <>
            <FloatingPCAEntryDialog
              open={f.floatingPCAEntryOpen}
              v2Enabled
              onSelectV1={() => {
                f.prefetchFloatingPCAConfigDialogV1().catch(() => {})
                f.openStep3V1Dialog()
              }}
              onSelectV2={() => {
                f.prefetchFloatingPCAConfigDialogV2().catch(() => {})
                f.openStep3V2Dialog()
              }}
              onCancel={f.handleFloatingPCAConfigCancel}
            />
            <FloatingPCAConfigDialogV1
              open={f.floatingPCAConfigV1Open}
              teams={f.visibleTeams}
              weekday={getWeekday(f.selectedDate)}
              initialPendingFTE={f.pendingPCAFTEForStep3Dialog}
              pcaPreferences={f.pcaPreferences as any}
              floatingPCAs={f.floatingPCAsForStep3}
              existingAllocations={f.existingAllocationsForStep3Dialog}
              specialPrograms={f.specialPrograms as any}
              bufferStaff={f.bufferStaff}
              staffOverrides={f.staffOverrides as any}
              step31AssignedByTeam={f.step3BootstrapSummary.existingAssignedByTeam}
              step31TeamTargets={f.step3ProjectionV2.displayTargetByTeam}
              onSave={f.handleFloatingPCAConfigSave}
              onCancel={f.handleFloatingPCAConfigCancel}
            />
            <FloatingPCAConfigDialogV2
              open={f.floatingPCAConfigV2Open}
              teams={f.visibleTeams}
              weekday={getWeekday(f.selectedDate)}
              initialPendingFTE={f.pendingPCAFTEForStep3Dialog}
              pcaPreferences={f.pcaPreferences as any}
              floatingPCAs={f.floatingPCAsForStep3}
              existingAllocations={f.existingAllocationsForStep3Dialog}
              specialPrograms={f.specialPrograms as any}
              bufferStaff={f.bufferStaff}
              staffOverrides={f.staffOverrides as any}
              step31AssignedByTeam={f.step3BootstrapSummary.existingAssignedByTeam}
              step31TeamTargets={f.step3ProjectionV2.displayTargetByTeam}
              step31RawAveragePCAPerTeamByTeam={
                (f.step2Result as Step2ResultSurplusProjectionForStep3 | null)?.rawAveragePCAPerTeam
              }
              initialStep3ProjectionV2={f.step3ProjectionV2}
              step31ReservedSpecialProgramPcaFte={f.reservedSpecialProgramPcaFteForStep3}
              step31BootstrapStaff={[...f.staff, ...f.bufferStaff]}
              onSave={f.handleFloatingPCAConfigSave}
              onCancel={f.handleFloatingPCAConfigCancel}
            />
          </>
        ) : null
      }
      specialProgramOverrideDialog={
        s2.showSpecialProgramOverrideDialog ? (
          <SpecialProgramOverrideDialog
            open={s2.showSpecialProgramOverrideDialog}
            onOpenChange={(open) => {
              s2.setShowSpecialProgramOverrideDialog(open)
              if (!open) {
                const resolver = specialProgramOverrideResolverRef.current
                if (resolver) {
                  resolver(null)
                  specialProgramOverrideResolverRef.current = null
                }
              }
            }}
            specialPrograms={s2.specialPrograms ?? []}
            allStaff={Array.from(new Map([...s2.staff, ...s2.inactiveStaff].map((s) => [s.id, s])).values())}
            sptBaseFteByStaffId={s2.sptBaseFteByStaffId}
            staffOverrides={s2.staffOverrides as any}
            weekday={getWeekday(s2.selectedDate)}
            showSubstituteStep={s2.showStep21InStep2Stepper}
            showSharedTherapistStep={s2.showSharedTherapistStep}
            downstreamImpact={s2.step2DownstreamImpact}
            onConfirm={(overrides) => {
              const resolver = specialProgramOverrideResolverRef.current
              if (resolver) {
                resolver(overrides)
                specialProgramOverrideResolverRef.current = null
              }
              s2.setShowSpecialProgramOverrideDialog(false)
            }}
            onSkip={() => {
              const resolver = specialProgramOverrideResolverRef.current
              if (resolver) {
                resolver({})
                specialProgramOverrideResolverRef.current = null
              }
              s2.setShowSpecialProgramOverrideDialog(false)
            }}
            onStaffRefresh={() => {
              return (async () => {
                try {
                  await s2.loadStaff()
                  await s2.loadSPTAllocations()
                } catch (e) {
                  console.error('Error refreshing staff after buffer creation:', e)
                }
              })()
            }}
          />
        ) : null
      }
      sptFinalEditDialog={
        s2.showSptFinalEditDialog ? (
          <SptFinalEditDialog
            open={s2.showSptFinalEditDialog}
            onOpenChange={(open) => {
              s2.setShowSptFinalEditDialog(open)
              if (!open) {
                const resolver = sptFinalEditResolverRef.current
                if (resolver) {
                  resolver(null)
                  sptFinalEditResolverRef.current = null
                }
              }
            }}
            weekday={getWeekday(s2.selectedDate)}
            sptStaff={s2.sptStaffForStep22}
            allStaff={s2.staff}
            specialPrograms={s2.specialPrograms ?? undefined}
            sptWeekdayByStaffId={s2.sptWeekdayByStaffId as any}
            sptTeamsByStaffId={s2.sptTeamsByStaffIdForStep22 as any}
            staffOverrides={s2.staffOverrides as any}
            showSubstituteStep={s2.showStep21InStep2Stepper}
            showSharedTherapistStep={s2.showSharedTherapistStep}
            downstreamImpact={s2.step2DownstreamImpact}
            currentAllocationByStaffId={s2.currentSptAllocationByStaffIdForStep22 as any}
            ptPerTeamByTeam={s2.ptPerTeamByTeamForStep22}
            onConfirm={(updates) => {
              const resolver = sptFinalEditResolverRef.current
              if (resolver) {
                resolver(updates as any)
                sptFinalEditResolverRef.current = null
              }
              s2.setShowSptFinalEditDialog(false)
            }}
            onSkip={() => {
              const resolver = sptFinalEditResolverRef.current
              if (resolver) {
                resolver({})
                sptFinalEditResolverRef.current = null
              }
              s2.setShowSptFinalEditDialog(false)
            }}
            onBack={() => {
              const resolver = sptFinalEditResolverRef.current
              if (resolver) {
                resolver({ __nav: 'back' } as any)
                sptFinalEditResolverRef.current = null
              }
              s2.setShowSptFinalEditDialog(false)
            }}
          />
        ) : null
      }
      sharedTherapistEditDialog={
        s2.showSharedTherapistEditDialog && s2.sharedTherapistDialogData ? (
          <SharedTherapistEditDialog
            open={s2.showSharedTherapistEditDialog}
            onOpenChange={(open) => {
              s2.setShowSharedTherapistEditDialog(open)
              if (!open) {
                const resolver = sharedTherapistEditResolverRef.current
                if (resolver) {
                  resolver(null)
                  sharedTherapistEditResolverRef.current = null
                }
                s2.setSharedTherapistDialogData(null)
              }
            }}
            sharedTherapists={s2.sharedTherapistDialogData.sharedTherapists}
            staffOverrides={s2.sharedTherapistDialogData.staffOverrides}
            currentAllocationByStaffId={s2.sharedTherapistDialogData.currentAllocationByStaffId}
            ptPerTeamByTeam={s2.sharedTherapistDialogData.ptPerTeamByTeam}
            showSubstituteStep={s2.showStep21InStep2Stepper}
            downstreamImpact={s2.step2DownstreamImpact}
            onConfirm={(updates) => {
              const resolver = sharedTherapistEditResolverRef.current
              if (resolver) {
                resolver(updates as any)
                sharedTherapistEditResolverRef.current = null
              }
              s2.setShowSharedTherapistEditDialog(false)
              s2.setSharedTherapistDialogData(null)
            }}
            onSkip={() => {
              const resolver = sharedTherapistEditResolverRef.current
              if (resolver) {
                resolver({})
                sharedTherapistEditResolverRef.current = null
              }
              s2.setShowSharedTherapistEditDialog(false)
              s2.setSharedTherapistDialogData(null)
            }}
            onBack={() => {
              const resolver = sharedTherapistEditResolverRef.current
              if (resolver) {
                resolver({ __nav: 'back' } as any)
                sharedTherapistEditResolverRef.current = null
              }
              s2.setShowSharedTherapistEditDialog(false)
              s2.setSharedTherapistDialogData(null)
            }}
          />
        ) : null
      }
      nonFloatingSubstitutionDialog={
        s2.substitutionWizardDataForDisplay && s2.substitutionWizardOpen ? (
          <NonFloatingSubstitutionDialog
            open={s2.substitutionWizardOpen}
            teams={s2.substitutionWizardDataForDisplay.teams}
            substitutionsByTeam={s2.substitutionWizardDataForDisplay.substitutionsByTeam}
            isWizardMode={s2.substitutionWizardDataForDisplay.isWizardMode}
            initialSelections={s2.substitutionWizardDataForDisplay.initialSelections}
            allStaff={s2.staff}
            pcaPreferences={s2.pcaPreferences as any}
            specialPrograms={s2.specialPrograms ?? []}
            weekday={getWeekday(s2.selectedDate)}
            currentAllocations={[]}
            staffOverrides={s2.staffOverrides as any}
            showSharedTherapistStep={s2.showSharedTherapistStep}
            downstreamImpact={s2.step2DownstreamImpact}
            onConfirm={s2.handleSubstitutionWizardConfirm}
            onCancel={s2.handleSubstitutionWizardCancel}
            onSkip={s2.handleSubstitutionWizardSkip}
            onBack={
              s2.substitutionWizardDataForDisplay.allowBackToSpecialPrograms
                ? () => {
                    if (substitutionWizardResolverRef.current) {
                      ;(substitutionWizardResolverRef.current as any)({}, { back: true })
                      substitutionWizardResolverRef.current = null
                    }
                    s2.setSubstitutionWizardOpen(false)
                    s2.setSubstitutionWizardData(null)
                  }
                : undefined
            }
          />
        ) : null
      }
      calendarPopover={
        cal.calendarOpen ? (
          <ScheduleCalendarPopover
            open={cal.calendarOpen}
            selectedDate={cal.selectedDate}
            datesWithData={cal.datesWithData}
            holidays={cal.holidays}
            onClose={() => cal.setCalendarOpen(false)}
            onDateSelect={(date) => {
              cal.queueDateTransition(date)
              cal.setCalendarOpen(false)
            }}
            anchorRef={cal.calendarButtonRef}
            popoverRef={cal.calendarPopoverRef}
          />
        ) : null
      }
    />
  )
}
