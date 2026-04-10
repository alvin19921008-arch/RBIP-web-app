import type { PCAData, FloatingPCAAllocationResultV2 } from '@/lib/algorithms/pcaAllocation'
import { allocateFloatingPCA_v2RankedSlot } from '@/lib/algorithms/pcaAllocation'
import { getWeekday } from '@/lib/features/schedule/date'
import { TEAMS } from '@/lib/features/schedule/constants'
import {
  computeAdjacentSlotReservations,
  computeReservations,
  executeSlotAssignments,
  simulateStep30BufferPreAssignments,
  type SlotAssignment,
} from '@/lib/utils/reservationLogic'
import {
  finalizeTrackerSummary,
  getTeamFloor,
  getTeamPreferenceInfo,
  isFloorPCAForTeam,
  recordAssignment,
} from '@/lib/utils/floatingPCAHelpers'
import type { PCAPreference, SpecialProgram } from '@/types/allocation'
import type { PCAAllocation } from '@/types/schedule'
import type { Staff, Team } from '@/types/staff'

type HarnessAssignment = { team: Team; slot: number; pcaId: string; pcaName: string }

export interface Step3V2HarnessAutoArgs {
  currentPendingFTE: Record<Team, number>
  visibleTeams: Team[]
  floatingPCAs: PCAData[]
  existingAllocations: PCAAllocation[]
  pcaPreferences: PCAPreference[]
  specialPrograms: SpecialProgram[]
  staffOverrides: Record<string, any>
  selectedDate: Date
  autoStep32: boolean
  autoStep33: boolean
  bufferPreAssignRatio: number
  bufferStaff: Staff[]
}

export interface Step3V2HarnessAutoResult {
  result: FloatingPCAAllocationResultV2
  teamOrder: Team[]
  step30Assignments: HarnessAssignment[]
  step32Assignments: HarnessAssignment[]
  step33Assignments: HarnessAssignment[]
}

export async function executeStep3V2HarnessAuto(
  args: Step3V2HarnessAutoArgs
): Promise<Step3V2HarnessAutoResult> {
  const runtimeTeams = args.visibleTeams.length > 0 ? args.visibleTeams : TEAMS
  const pending0 = { ...args.currentPendingFTE }

  TEAMS.forEach((team) => {
    if (!runtimeTeams.includes(team)) pending0[team] = 0
  })

  const teamOrder = [...runtimeTeams].sort((a, b) => {
    const d = (pending0[b] || 0) - (pending0[a] || 0)
    if (d !== 0) return d
    return runtimeTeams.indexOf(a) - runtimeTeams.indexOf(b)
  })

  let currentPending: Record<Team, number> = { ...pending0 }
  let currentAllocations: PCAAllocation[] = args.existingAllocations.map((allocation) => ({ ...allocation }))

  const step30Assignments: HarnessAssignment[] = []
  const step32Assignments: HarnessAssignment[] = []
  const step33Assignments: HarnessAssignment[] = []

  const ratio = Math.max(0, Math.min(1, args.bufferPreAssignRatio || 0))
  if (ratio > 0) {
    const bufferFloatingPCAs = args.bufferStaff.filter(
      (staff) => staff.rank === 'PCA' && staff.status === 'buffer' && (staff as any).floating
    )
    const step30Result = simulateStep30BufferPreAssignments({
      currentPendingFTE: currentPending,
      currentAllocations,
      floatingPCAs: args.floatingPCAs,
      bufferFloatingPCAIds: bufferFloatingPCAs.map((staff) => staff.id),
      teamOrder,
      ratio,
    })
    step30Assignments.push(...step30Result.step30Assignments)
    currentPending = step30Result.updatedPendingFTE
    currentAllocations = step30Result.updatedAllocations
  }

  if (args.autoStep32) {
    const reservations = computeReservations(
      args.pcaPreferences,
      currentPending,
      args.floatingPCAs,
      currentAllocations,
      args.staffOverrides
    )
    const used = new Set<string>()
    for (const team of teamOrder) {
      const info = reservations.teamReservations[team]
      if (!info) continue
      const slot = info.slot
      const candidates = [...(info.pcaIds || [])].sort((a, b) => {
        const aName = info.pcaNames?.[a] || a
        const bName = info.pcaNames?.[b] || b
        if (aName !== bName) return aName.localeCompare(bName)
        return a.localeCompare(b)
      })
      for (const pcaId of candidates) {
        const key = `${pcaId}:${slot}`
        if (used.has(key)) continue
        used.add(key)
        const assignment = { team, slot, pcaId, pcaName: info.pcaNames?.[pcaId] || 'Unknown PCA' }
        step32Assignments.push(assignment)
        const reservationResult = executeSlotAssignments(
          [assignment],
          currentPending,
          currentAllocations,
          args.floatingPCAs
        )
        currentPending = reservationResult.updatedPendingFTE
        currentAllocations = reservationResult.updatedAllocations
        break
      }
    }
  }

  if (args.autoStep33) {
    const used = new Set<string>()
    const markUsedFromAllocations = () => {
      used.clear()
      for (const allocation of currentAllocations) {
        if (allocation.slot1) used.add(`${allocation.staff_id}:1`)
        if (allocation.slot2) used.add(`${allocation.staff_id}:2`)
        if (allocation.slot3) used.add(`${allocation.staff_id}:3`)
        if (allocation.slot4) used.add(`${allocation.staff_id}:4`)
      }
    }

    markUsedFromAllocations()

    while (true) {
      const adjacent = computeAdjacentSlotReservations(
        currentPending,
        currentAllocations,
        args.floatingPCAs,
        args.specialPrograms,
        args.staffOverrides,
        getWeekday(args.selectedDate)
      )
      if (!adjacent.hasAnyAdjacentReservations) break

      let picked = false
      for (const team of teamOrder) {
        const pending = currentPending[team] || 0
        if (pending <= 0) continue
        const options = [...(adjacent.adjacentReservations[team] || [])].sort((a, b) => {
          if (a.pcaName !== b.pcaName) return a.pcaName.localeCompare(b.pcaName)
          return a.adjacentSlot - b.adjacentSlot
        })
        for (const option of options) {
          const slot = option.adjacentSlot
          const key = `${option.pcaId}:${slot}`
          if (used.has(key)) continue
          const assignment = { team, slot, pcaId: option.pcaId, pcaName: option.pcaName }
          step33Assignments.push(assignment)
          const adjacentResult = executeSlotAssignments(
            [assignment],
            currentPending,
            currentAllocations,
            args.floatingPCAs
          )
          currentPending = adjacentResult.updatedPendingFTE
          currentAllocations = adjacentResult.updatedAllocations
          markUsedFromAllocations()
          picked = true
          break
        }
      }

      if (!picked) break
    }
  }

  const result = await allocateFloatingPCA_v2RankedSlot({
    teamOrder,
    currentPendingFTE: currentPending,
    existingAllocations: currentAllocations,
    pcaPool: args.floatingPCAs,
    pcaPreferences: args.pcaPreferences,
    specialPrograms: args.specialPrograms,
    mode: 'standard',
    // Leave Sim V2 should exercise the true ranked-slot engine, so preserve ranked slots.
    preferenceSelectionMode: 'legacy',
    selectedPreferenceAssignments: [
      ...step32Assignments.map((assignment) => ({
        team: assignment.team,
        slot: assignment.slot,
        pcaId: assignment.pcaId,
        source: 'step32' as const,
      })),
      ...step33Assignments.map((assignment) => ({
        team: assignment.team,
        slot: assignment.slot,
        pcaId: assignment.pcaId,
        source: 'step33' as const,
      })),
    ],
    extraCoverageMode: 'round-robin-team-order',
  })

  const allocationOrderMap = new Map<Team, number>()
  teamOrder.forEach((team, index) => allocationOrderMap.set(team, index + 1))

  const addAssignmentsToTracker = (
    assignments: HarnessAssignment[],
    assignedIn: 'step30' | 'step32' | 'step33'
  ) => {
    for (const assignment of assignments) {
      const pca = args.floatingPCAs.find((candidate) => candidate.id === assignment.pcaId)
      if (!pca) continue
      const teamPref = getTeamPreferenceInfo(assignment.team, args.pcaPreferences)
      const teamFloor = getTeamFloor(assignment.team, args.pcaPreferences)
      const isPreferredPCA = teamPref.preferredPCAIds.includes(assignment.pcaId)
      const isPreferredSlot = teamPref.preferredSlot === assignment.slot
      recordAssignment(result.tracker as any, assignment.team, {
        slot: assignment.slot,
        pcaId: assignment.pcaId,
        pcaName: assignment.pcaName,
        assignedIn,
        wasPreferredSlot: isPreferredSlot,
        wasPreferredPCA: isPreferredPCA,
        wasFloorPCA: isFloorPCAForTeam(pca, teamFloor),
        allocationOrder: allocationOrderMap.get(assignment.team),
        isBufferAssignment: assignedIn === 'step30',
      } as any)
    }
  }

  addAssignmentsToTracker(step30Assignments, 'step30')
  addAssignmentsToTracker(step32Assignments, 'step32')
  addAssignmentsToTracker(step33Assignments, 'step33')
  finalizeTrackerSummary(result.tracker as any)

  return {
    result,
    teamOrder,
    step30Assignments,
    step32Assignments,
    step33Assignments,
  }
}
