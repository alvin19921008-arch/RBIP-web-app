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

export type SchedulePageDialogNodesProps = {
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

  tieBreakDialogOpen: boolean
  setTieBreakDialogOpen: (open: boolean) => void
  tieBreakTeams: Team[]
  tieBreakPendingFTE: number

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

  floatingPcaDialogProps: ScheduleFloatingPcaDialogBundle

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

  calendarOpen: boolean
  setCalendarOpen: (open: boolean) => void
  queueDateTransition: (date: Date) => void
  calendarButtonRef: RefObject<HTMLButtonElement | null>
  calendarPopoverRef: RefObject<HTMLDivElement | null>
}

export function SchedulePageDialogNodes(props: SchedulePageDialogNodesProps) {
  const {
    tieBreakResolverRef,
    specialProgramOverrideResolverRef,
    sptFinalEditResolverRef,
    sharedTherapistEditResolverRef,
    substitutionWizardResolverRef,
    floatingPcaDialogProps: f,
    ...p
  } = props

  return (
    <ScheduleDialogsLayer
      bedCountsDialog={p.editingBedTeam && (() => {
        const team = p.editingBedTeam

        const wardRows: BedCountsWardRow[] = p.wards
          .filter((w) => (w.team_assignments[team] || 0) > 0)
          .map((w) => ({
            wardName: w.name,
            wardLabel: formatWardLabel(w as any, team),
            wardTotalBeds: w.total_beds,
            baselineTeamBeds: w.team_assignments[team] || 0,
          }))

        const initialOverrides = p.bedCountsOverridesByTeam?.[team]

        return (
          <BedCountsEditDialog
            open={true}
            onOpenChange={(open) => {
              if (!open) p.setEditingBedTeam(null)
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

              p.captureUndoCheckpoint('Bed counts override')
              p.setBedCountsOverridesByTeam((prev) => {
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
              p.setStepStatus((prev) => ({
                ...prev,
                'bed-relieving': prev['bed-relieving'] === 'completed' ? 'modified' : prev['bed-relieving'],
                review: 'pending',
              }))
            }}
          />
        )
      })()}
      step1LeaveSetupDialog={
        p.step1LeaveSetupOpen ? (
          <Step1LeaveSetupDialog
            open={p.step1LeaveSetupOpen}
            onOpenChange={p.setStep1LeaveSetupOpen}
            staff={p.staff}
            staffOverrides={p.staffOverrides as any}
            specialPrograms={p.specialPrograms ?? []}
            sptAllocations={p.sptAllocations}
            weekday={p.currentWeekday}
            onSaveDraft={p.handleSaveStep1LeaveSetup}
          />
        ) : null
      }
      staffEditDialog={p.editingStaffId && (() => {
        const staffMember = p.staff.find((s) => s.id === p.editingStaffId)
        if (!staffMember) return null

        // Find current leave type and FTE from overrides first, then allocations
        const override = (p.staffOverrides as any)[p.editingStaffId]
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
            const alloc = p.therapistAllocations[team].find((a) => a.staff_id === p.editingStaffId)
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
              p.pcaAllocationsForUi[team].filter((a) => a.staff_id === p.editingStaffId)
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
          const cfg = p.sptAllocations.find(
            (a) => a.staff_id === p.editingStaffId && a.weekdays?.includes(p.currentWeekday)
          )
          const cfgFTEraw = (cfg as any)?.fte_addon
          const cfgFTE =
            typeof cfgFTEraw === 'number' ? cfgFTEraw : cfgFTEraw != null ? parseFloat(String(cfgFTEraw)) : NaN
          sptConfiguredFTE = Number.isFinite(cfgFTE) ? Math.max(0, Math.min(cfgFTE, 1.0)) : 0

          const o = (p.staffOverrides as any)[p.editingStaffId]
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
            open={p.editDialogOpen}
            onOpenChange={p.setEditDialogOpen}
            staffName={staffMember.name}
            staffId={p.editingStaffId}
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
            allStaff={p.staff}
            specialPrograms={p.specialPrograms ?? undefined}
            weekday={p.currentWeekday}
            onSave={p.handleSaveStaffEdit}
          />
        )
      })()}
      tieBreakDialog={
        p.tieBreakDialogOpen ? (
          <TieBreakDialog
            open={p.tieBreakDialogOpen}
            teams={p.tieBreakTeams}
            pendingFTE={p.tieBreakPendingFTE}
            onSelect={(team) => {
              const resolver = tieBreakResolverRef.current
              if (resolver) {
                resolver(team)
                tieBreakResolverRef.current = null
              }
              p.setTieBreakDialogOpen(false)
            }}
          />
        ) : null
      }
      copyWizardDialog={
        p.copyWizardConfig ? (
          <ScheduleCopyWizard
            open={p.copyWizardOpen}
            onOpenChange={(open) => {
              if (!open) {
                p.setCopyWizardOpen(false)
                p.setCopyWizardConfig(null)
              } else {
                p.setCopyWizardOpen(true)
              }
            }}
            sourceDate={p.copyWizardConfig.sourceDate}
            initialTargetDate={p.copyWizardConfig.targetDate}
            flowType={p.copyWizardConfig.flowType}
            direction={p.copyWizardConfig.direction}
            datesWithData={p.datesWithData}
            holidays={p.holidays}
            onConfirmCopy={p.handleConfirmCopy}
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
        p.showSpecialProgramOverrideDialog ? (
          <SpecialProgramOverrideDialog
            open={p.showSpecialProgramOverrideDialog}
            onOpenChange={(open) => {
              p.setShowSpecialProgramOverrideDialog(open)
              if (!open) {
                const resolver = specialProgramOverrideResolverRef.current
                if (resolver) {
                  resolver(null)
                  specialProgramOverrideResolverRef.current = null
                }
              }
            }}
            specialPrograms={p.specialPrograms ?? []}
            allStaff={Array.from(new Map([...p.staff, ...p.inactiveStaff].map((s) => [s.id, s])).values())}
            sptBaseFteByStaffId={p.sptBaseFteByStaffId}
            staffOverrides={p.staffOverrides as any}
            weekday={getWeekday(p.selectedDate)}
            showSubstituteStep={p.showStep21InStep2Stepper}
            showSharedTherapistStep={p.showSharedTherapistStep}
            downstreamImpact={p.step2DownstreamImpact}
            onConfirm={(overrides) => {
              const resolver = specialProgramOverrideResolverRef.current
              if (resolver) {
                resolver(overrides)
                specialProgramOverrideResolverRef.current = null
              }
              p.setShowSpecialProgramOverrideDialog(false)
            }}
            onSkip={() => {
              const resolver = specialProgramOverrideResolverRef.current
              if (resolver) {
                resolver({})
                specialProgramOverrideResolverRef.current = null
              }
              p.setShowSpecialProgramOverrideDialog(false)
            }}
            onStaffRefresh={() => {
              return (async () => {
                try {
                  await p.loadStaff()
                  await p.loadSPTAllocations()
                } catch (e) {
                  console.error('Error refreshing staff after buffer creation:', e)
                }
              })()
            }}
          />
        ) : null
      }
      sptFinalEditDialog={
        p.showSptFinalEditDialog ? (
          <SptFinalEditDialog
            open={p.showSptFinalEditDialog}
            onOpenChange={(open) => {
              p.setShowSptFinalEditDialog(open)
              if (!open) {
                const resolver = sptFinalEditResolverRef.current
                if (resolver) {
                  resolver(null)
                  sptFinalEditResolverRef.current = null
                }
              }
            }}
            weekday={getWeekday(p.selectedDate)}
            sptStaff={p.sptStaffForStep22}
            allStaff={p.staff}
            specialPrograms={p.specialPrograms ?? undefined}
            sptWeekdayByStaffId={p.sptWeekdayByStaffId as any}
            sptTeamsByStaffId={p.sptTeamsByStaffIdForStep22 as any}
            staffOverrides={p.staffOverrides as any}
            showSubstituteStep={p.showStep21InStep2Stepper}
            showSharedTherapistStep={p.showSharedTherapistStep}
            downstreamImpact={p.step2DownstreamImpact}
            currentAllocationByStaffId={p.currentSptAllocationByStaffIdForStep22 as any}
            ptPerTeamByTeam={p.ptPerTeamByTeamForStep22}
            onConfirm={(updates) => {
              const resolver = sptFinalEditResolverRef.current
              if (resolver) {
                resolver(updates as any)
                sptFinalEditResolverRef.current = null
              }
              p.setShowSptFinalEditDialog(false)
            }}
            onSkip={() => {
              const resolver = sptFinalEditResolverRef.current
              if (resolver) {
                resolver({})
                sptFinalEditResolverRef.current = null
              }
              p.setShowSptFinalEditDialog(false)
            }}
            onBack={() => {
              const resolver = sptFinalEditResolverRef.current
              if (resolver) {
                resolver({ __nav: 'back' } as any)
                sptFinalEditResolverRef.current = null
              }
              p.setShowSptFinalEditDialog(false)
            }}
          />
        ) : null
      }
      sharedTherapistEditDialog={
        p.showSharedTherapistEditDialog && p.sharedTherapistDialogData ? (
          <SharedTherapistEditDialog
            open={p.showSharedTherapistEditDialog}
            onOpenChange={(open) => {
              p.setShowSharedTherapistEditDialog(open)
              if (!open) {
                const resolver = sharedTherapistEditResolverRef.current
                if (resolver) {
                  resolver(null)
                  sharedTherapistEditResolverRef.current = null
                }
                p.setSharedTherapistDialogData(null)
              }
            }}
            sharedTherapists={p.sharedTherapistDialogData.sharedTherapists}
            staffOverrides={p.sharedTherapistDialogData.staffOverrides}
            currentAllocationByStaffId={p.sharedTherapistDialogData.currentAllocationByStaffId}
            ptPerTeamByTeam={p.sharedTherapistDialogData.ptPerTeamByTeam}
            showSubstituteStep={p.showStep21InStep2Stepper}
            downstreamImpact={p.step2DownstreamImpact}
            onConfirm={(updates) => {
              const resolver = sharedTherapistEditResolverRef.current
              if (resolver) {
                resolver(updates as any)
                sharedTherapistEditResolverRef.current = null
              }
              p.setShowSharedTherapistEditDialog(false)
              p.setSharedTherapistDialogData(null)
            }}
            onSkip={() => {
              const resolver = sharedTherapistEditResolverRef.current
              if (resolver) {
                resolver({})
                sharedTherapistEditResolverRef.current = null
              }
              p.setShowSharedTherapistEditDialog(false)
              p.setSharedTherapistDialogData(null)
            }}
            onBack={() => {
              const resolver = sharedTherapistEditResolverRef.current
              if (resolver) {
                resolver({ __nav: 'back' } as any)
                sharedTherapistEditResolverRef.current = null
              }
              p.setShowSharedTherapistEditDialog(false)
              p.setSharedTherapistDialogData(null)
            }}
          />
        ) : null
      }
      nonFloatingSubstitutionDialog={
        p.substitutionWizardDataForDisplay && p.substitutionWizardOpen ? (
          <NonFloatingSubstitutionDialog
            open={p.substitutionWizardOpen}
            teams={p.substitutionWizardDataForDisplay.teams}
            substitutionsByTeam={p.substitutionWizardDataForDisplay.substitutionsByTeam}
            isWizardMode={p.substitutionWizardDataForDisplay.isWizardMode}
            initialSelections={p.substitutionWizardDataForDisplay.initialSelections}
            allStaff={p.staff}
            pcaPreferences={p.pcaPreferences as any}
            specialPrograms={p.specialPrograms ?? []}
            weekday={getWeekday(p.selectedDate)}
            currentAllocations={[]}
            staffOverrides={p.staffOverrides as any}
            showSharedTherapistStep={p.showSharedTherapistStep}
            downstreamImpact={p.step2DownstreamImpact}
            onConfirm={p.handleSubstitutionWizardConfirm}
            onCancel={p.handleSubstitutionWizardCancel}
            onSkip={p.handleSubstitutionWizardSkip}
            onBack={
              p.substitutionWizardDataForDisplay.allowBackToSpecialPrograms
                ? () => {
                    if (substitutionWizardResolverRef.current) {
                      ;(substitutionWizardResolverRef.current as any)({}, { back: true })
                      substitutionWizardResolverRef.current = null
                    }
                    p.setSubstitutionWizardOpen(false)
                    p.setSubstitutionWizardData(null)
                  }
                : undefined
            }
          />
        ) : null
      }
      calendarPopover={
        p.calendarOpen ? (
          <ScheduleCalendarPopover
            open={p.calendarOpen}
            selectedDate={p.selectedDate}
            datesWithData={p.datesWithData}
            holidays={p.holidays}
            onClose={() => p.setCalendarOpen(false)}
            onDateSelect={(date) => {
              p.queueDateTransition(date)
              p.setCalendarOpen(false)
            }}
            anchorRef={p.calendarButtonRef}
            popoverRef={p.calendarPopoverRef}
          />
        ) : null
      }
    />
  )
}
