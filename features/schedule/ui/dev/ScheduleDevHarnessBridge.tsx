'use client'

import dynamic from 'next/dynamic'
import type { MutableRefObject, SetStateAction } from 'react'
import { getWeekday } from '@/lib/features/schedule/date'
import { TEAMS } from '@/lib/features/schedule/constants'
import { resetStep2OverridesForAlgoEntry } from '@/lib/features/schedule/stepReset'
import type { FloatingPCAAllocationResultV2 } from '@/lib/algorithms/pcaAllocation'
import type { StaffOverrides } from '@/lib/hooks/useAllocationSync'
import type { SlotAssignment } from '@/lib/utils/reservationLogic'
import type { SpecialProgram, SPTAllocation, PCAPreference } from '@/types/allocation'
import type { Team, Weekday, Staff } from '@/types/staff'
import type {
  ScheduleCalculations,
  ScheduleStepId,
  TherapistAllocation,
  PCAAllocation,
} from '@/types/schedule'

const ScheduleDevLeaveSimBridgeDynamic = dynamic(
  () =>
    import('@/features/schedule/ui/dev/ScheduleDevLeaveSimBridge').then(
      (m) => m.ScheduleDevLeaveSimBridge
    ),
  { ssr: false }
)

type AutoStep2Args = {
  autoStep20: boolean
  autoStep21: boolean
  autoStep22: boolean
  autoStep23: boolean
}

type AutoStep3V2Args = {
  autoStep32: boolean
  autoStep33: boolean
  bufferPreAssignRatio: number
}

type ScheduleDevHarnessBridgeProps = {
  allowRuntime: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  setDevLeaveSimOpen: (open: boolean) => void
  userRole: 'developer' | 'admin' | 'user'
  selectedDate: Date
  selectedDateKey: string
  weekday: Weekday
  staff: Staff[]
  bufferStaff: Staff[]
  specialPrograms: SpecialProgram[]
  sptAllocations: SPTAllocation[]
  staffOverrides: StaffOverrides
  showSharedTherapistStep: boolean
  visibleTeams: Team[]
  pendingPCAFTEPerTeam: Record<Team, number>
  setStaffOverrides: (next: StaffOverrides) => void
  clearDomainFromStep: (stepId: ScheduleStepId) => void
  goToStep: (stepId: ScheduleStepId) => void
  setInitializedSteps: (next: Set<string>) => void
  setStepStatus: (next: Record<string, 'pending' | 'completed' | 'modified'>) => void
  setStep2Result: (next: unknown) => void
  setHasSavedAllocations: (next: boolean) => void
  setTieBreakDecisions: (next: SetStateAction<Record<string, Team>>) => void
  recalculateScheduleCalculations: () => void
  runStep2TherapistAndNonFloatingPCA: (args: {
    cleanedOverrides: StaffOverrides
    toast: (title: string, variant?: any, description?: string) => number
    onStep21Projection: ({ showStep21 }: { showStep21: boolean | null }) => void
  }) => Promise<unknown>
  runStep3FloatingPCA: (args: {
    onTieBreak?: (params: {
      teams: Team[]
      pendingFTE: number
      tieBreakKey: string
    }) => Promise<Team>
    userTeamOrder?: Team[]
    userAdjustedPendingFTE?: Record<Team, number>
  }) => Promise<void>
  setStep21RuntimeVisible: (visible: boolean | null) => void
  showActionToast: (title: string, variant?: any, description?: string) => number
  specialProgramOverrideResolverRef: MutableRefObject<
    ((overrides: Record<string, any>) => void) | null
  >
  prefetchSpecialProgramOverrideDialog: () => Promise<unknown>
  setShowSpecialProgramOverrideDialog: (open: boolean) => void
  generateStep2TherapistAndNonFloatingPCA: (cleanedOverrides: StaffOverrides) => Promise<unknown>
  runStep2WithHarnessSubstitutionAuto: (
    cleanedOverrides: StaffOverrides,
    autoSelectSubstitutions: (params: {
      teams: Team[]
      substitutionsByTeam: Record<Team, any[]>
    }) => Record<string, Array<{ floatingPCAId: string; slots: number[] }>>
  ) => Promise<unknown>
  showStep2Point2SptFinalEdit: () => Promise<any>
  applyStep2Point2SptFinalEdits: (updates: any) => void
  showStep2Point3SharedTherapistEdit: () => Promise<any>
  applyStep2Point3SharedTherapistEdits: (updates: any) => void
  floatingPCAsForStep3: any[]
  existingAllocationsForStep3: any[]
  pcaPreferences: PCAPreference[]
  handleFloatingPCAConfigSave: (
    result: FloatingPCAAllocationResultV2,
    teamOrder: Team[],
    step32Assignments: SlotAssignment[],
    step33Assignments: SlotAssignment[]
  ) => Promise<void>
  step2Result: unknown
  openStep3EntryDialog: () => void
  runStep4BedRelieving: (args: {
    toast: (title: string, variant?: any, description?: string) => number
  }) => Promise<void>
  therapistAllocationsByTeam: Record<Team, Array<TherapistAllocation & { staff: Staff }>>
  pcaAllocationsByTeam: Record<Team, Array<PCAAllocation & { staff: Staff }>>
  calculationsByTeam: Record<Team, ScheduleCalculations | null>
}

export function ScheduleDevHarnessBridge({
  allowRuntime,
  open,
  onOpenChange,
  setDevLeaveSimOpen,
  userRole,
  selectedDate,
  selectedDateKey,
  weekday,
  staff,
  bufferStaff,
  specialPrograms,
  sptAllocations,
  staffOverrides,
  showSharedTherapistStep,
  visibleTeams,
  pendingPCAFTEPerTeam,
  setStaffOverrides,
  clearDomainFromStep,
  goToStep,
  setInitializedSteps,
  setStepStatus,
  setStep2Result,
  setHasSavedAllocations,
  setTieBreakDecisions,
  recalculateScheduleCalculations,
  runStep2TherapistAndNonFloatingPCA,
  runStep3FloatingPCA,
  setStep21RuntimeVisible,
  showActionToast,
  specialProgramOverrideResolverRef,
  prefetchSpecialProgramOverrideDialog,
  setShowSpecialProgramOverrideDialog,
  generateStep2TherapistAndNonFloatingPCA,
  runStep2WithHarnessSubstitutionAuto,
  showStep2Point2SptFinalEdit,
  applyStep2Point2SptFinalEdits,
  showStep2Point3SharedTherapistEdit,
  applyStep2Point3SharedTherapistEdits,
  floatingPCAsForStep3,
  existingAllocationsForStep3,
  pcaPreferences,
  handleFloatingPCAConfigSave,
  step2Result,
  openStep3EntryDialog,
  runStep4BedRelieving,
  therapistAllocationsByTeam,
  pcaAllocationsByTeam,
  calculationsByTeam,
}: ScheduleDevHarnessBridgeProps) {
  if (!allowRuntime) return null

  return (
    <ScheduleDevLeaveSimBridgeDynamic
      open={open}
      onOpenChange={onOpenChange}
      userRole={userRole}
      selectedDate={selectedDate}
      selectedDateKey={selectedDateKey}
      weekday={weekday}
      staff={staff}
      specialPrograms={specialPrograms}
      sptAllocations={sptAllocations}
      staffOverrides={staffOverrides as any}
      showSharedTherapistStep={showSharedTherapistStep}
      visibleTeams={visibleTeams}
      pendingPCAFTEPerTeam={pendingPCAFTEPerTeam}
      setStaffOverrides={(next) => setStaffOverrides(next as any)}
      clearDomainFromStep={(stepId) => clearDomainFromStep(stepId as any)}
      goToStep={goToStep as any}
      setInitializedSteps={(next) => setInitializedSteps(next as any)}
      setStepStatus={(next) => setStepStatus(next as any)}
      setStep2Result={(next) => setStep2Result(next as any)}
      setHasSavedAllocations={(next) => setHasSavedAllocations(next as any)}
      setTieBreakDecisions={(next) => setTieBreakDecisions(next as any)}
      recalculateScheduleCalculations={recalculateScheduleCalculations}
      runStep2={async ({ cleanedOverrides }) => {
        setStep21RuntimeVisible(false)
        return await runStep2TherapistAndNonFloatingPCA({
          cleanedOverrides: cleanedOverrides as any,
          toast: showActionToast,
          onStep21Projection: ({ showStep21 }) => {
            setStep21RuntimeVisible(showStep21)
          },
        })
      }}
      runStep2Auto={async ({ autoStep20, autoStep21, autoStep22, autoStep23 }: AutoStep2Args) => {
        // Step numbering:
        // - Step 2.0: Special Program Override dialog
        // - Step 2.1: Non-floating PCA substitution dialog
        // - Step 2.2: SPT Final Edit dialog
        //
        // Harness flags:
        // - autoStep21 => skip Step 2.0 (special programs)
        // - autoStep20 => auto-handle Step 2.1 (substitution)
        // - autoStep22 => skip Step 2.2 (SPT final edit)
        // - autoStep23 => skip Step 2.3 (shared therapist edit) when applicable
        let baseOverrides: any = { ...(staffOverrides as any) }

        const activeSpecialPrograms = specialPrograms.filter((p) =>
          (p as any)?.weekdays?.includes?.(getWeekday(selectedDate))
        )

        if (!autoStep21 && activeSpecialPrograms.length > 0) {
          const overridesFromDialog = await new Promise<Record<string, any>>((resolve) => {
            const resolver = (overrides: Record<string, any>) => resolve(overrides || {})
            specialProgramOverrideResolverRef.current = resolver as any
            prefetchSpecialProgramOverrideDialog().catch(() => {})
            setStep21RuntimeVisible(null)
            setShowSpecialProgramOverrideDialog(true)
          })

          Object.entries(overridesFromDialog || {}).forEach(([staffId, override]) => {
            baseOverrides[staffId] = {
              ...(baseOverrides[staffId] ?? { leaveType: null, fteRemaining: 1.0 }),
              ...(override as any),
            }
          })
        }

        const cleanedOverrides = resetStep2OverridesForAlgoEntry({
          staffOverrides: baseOverrides,
          allStaff: [...staff, ...bufferStaff],
        })
        setStaffOverrides(cleanedOverrides as any)

        const autoSelectSubstitutions = (params: {
          teams: Team[]
          substitutionsByTeam: Record<Team, any[]>
        }): Record<string, Array<{ floatingPCAId: string; slots: number[] }>> => {
          const selections: Record<string, Array<{ floatingPCAId: string; slots: number[] }>> = {}
          const used = new Set<string>() // `${floatingId}:${slot}`

          const scoreCandidate = (c: any, missing: number[]) => {
            const avail: number[] = Array.isArray(c?.availableSlots) ? c.availableSlots : []
            const coverage = missing.filter((s) => avail.includes(s)).length
            const preferred = c?.isPreferred ? 1 : 0
            const floor = c?.isFloorPCA ? 1 : 0
            return { preferred, floor, coverage, name: String(c?.name ?? '') }
          }

          for (const team of params.teams) {
            const subs = params.substitutionsByTeam?.[team] ?? []
            for (const sub of subs) {
              const key = `${team}-${sub.nonFloatingPCAId}`
              const missingSlots: number[] = Array.isArray(sub?.missingSlots) ? sub.missingSlots : []
              const candidates: any[] = Array.isArray(sub?.availableFloatingPCAs)
                ? sub.availableFloatingPCAs
                : []
              if (missingSlots.length === 0 || candidates.length === 0) continue

              let remaining = [...missingSlots]
              const picked: Array<{ floatingPCAId: string; slots: number[] }> = []

              const sorted = [...candidates].sort((a, b) => {
                const sa = scoreCandidate(a, missingSlots)
                const sb = scoreCandidate(b, missingSlots)
                if (sa.preferred !== sb.preferred) return sb.preferred - sa.preferred
                if (sa.floor !== sb.floor) return sb.floor - sa.floor
                if (sa.coverage !== sb.coverage) return sb.coverage - sa.coverage
                return sa.name.localeCompare(sb.name)
              })

              for (const c of sorted) {
                if (remaining.length === 0) break
                const id = String(c?.id ?? '')
                if (!id) continue
                const avail: number[] = Array.isArray(c?.availableSlots) ? c.availableSlots : []
                const slots = remaining.filter((s) => avail.includes(s) && !used.has(`${id}:${s}`))
                if (slots.length === 0) continue
                slots.forEach((s) => used.add(`${id}:${s}`))
                picked.push({ floatingPCAId: id, slots })
                remaining = remaining.filter((s) => !slots.includes(s))
              }

              if (picked.length > 0) selections[key] = picked
            }
          }

          return selections
        }

        while (true) {
          if (!autoStep20) {
            await generateStep2TherapistAndNonFloatingPCA(cleanedOverrides as any)
          } else {
            await runStep2WithHarnessSubstitutionAuto(cleanedOverrides as any, autoSelectSubstitutions)
          }

          // Step 2.2 (SPT Final Edit)
          if (autoStep22) break
          const step22 = await showStep2Point2SptFinalEdit()
          if (step22 === null) break
          if ((step22 as any)?.__nav === 'back') continue
          if (step22 && Object.keys(step22).length > 0) {
            applyStep2Point2SptFinalEdits(step22 as any)
          }
          break
        }

        if (showSharedTherapistStep && !autoStep23) {
          const step23 = await showStep2Point3SharedTherapistEdit()
          if (step23 && Object.keys(step23).length > 0) {
            applyStep2Point3SharedTherapistEdits(step23 as any)
          }
        }
      }}
      runStep3={async (args) => {
        await runStep3FloatingPCA({
          onTieBreak: args.onTieBreak as any,
          userTeamOrder: args.userTeamOrder,
          userAdjustedPendingFTE: args.userAdjustedPendingFTE,
        })
      }}
      runStep3V2Auto={async ({ autoStep32, autoStep33, bufferPreAssignRatio }: AutoStep3V2Args) => {
        // Build defaults similar to the wizard (3.1/3.4), optionally auto-applying 3.0/3.2/3.3.
        const pending0 = { ...pendingPCAFTEPerTeam }
        const runtimeTeams = visibleTeams.length > 0 ? visibleTeams : TEAMS
        TEAMS.forEach((team) => {
          if (!runtimeTeams.includes(team)) pending0[team] = 0
        })
        const teamOrder = [...runtimeTeams].sort((a, b) => {
          const d = (pending0[b] || 0) - (pending0[a] || 0)
          if (d !== 0) return d
          return runtimeTeams.indexOf(a) - runtimeTeams.indexOf(b)
        })

        const { executeStep3V2HarnessAuto } = await import(
          '@/lib/features/schedule/step3Harness/runStep3V2Harness'
        )
        const harnessRun = await executeStep3V2HarnessAuto({
          currentPendingFTE: pending0 as Record<Team, number>,
          visibleTeams,
          floatingPCAs: floatingPCAsForStep3 as any,
          existingAllocations: existingAllocationsForStep3 as any,
          pcaPreferences,
          specialPrograms,
          staffOverrides: staffOverrides as any,
          selectedDate,
          autoStep32,
          autoStep33,
          bufferPreAssignRatio,
          bufferStaff: bufferStaff as any,
        })

        await handleFloatingPCAConfigSave(
          harnessRun.result,
          harnessRun.teamOrder,
          harnessRun.step32Assignments as any,
          harnessRun.step33Assignments as any
        )
      }}
      openStep3Wizard={() => {
        if (!step2Result) {
          showActionToast('Step 2 must be completed before Step 3.', 'warning')
          return
        }
        goToStep('floating-pca' as any)
        setDevLeaveSimOpen(false)
        openStep3EntryDialog()
      }}
      runStep4={async () => {
        await runStep4BedRelieving({ toast: showActionToast })
      }}
      therapistAllocationsByTeam={therapistAllocationsByTeam as any}
      pcaAllocationsByTeam={pcaAllocationsByTeam as any}
      calculationsByTeam={calculationsByTeam as any}
    />
  )
}
