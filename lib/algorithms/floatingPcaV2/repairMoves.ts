import type { Team } from '@/types/staff'
import type { PCAAllocation } from '@/types/schedule'
import type { PCAData } from '@/lib/algorithms/pcaAllocationTypes'
import type { RankedV2RepairDefect } from '@/lib/algorithms/floatingPcaV2/repairAudit'
import type { TeamPreferenceInfo } from '@/lib/utils/floatingPCAHelpers'

type Slot = 1 | 2 | 3 | 4

type SlotOwnerUpdate = {
  pcaId: string
  slot: Slot
  fromTeam: Team | null
  toTeam: Team | null
}

export type RepairAssignment = {
  team: Team
  pcaId: string
  slot: Slot
}

export type RepairCandidate = {
  defectKind: RankedV2RepairDefect['kind']
  reason: RankedV2RepairDefect['kind']
  sortKey: string
  allocations: PCAAllocation[]
  repairAssignments: RepairAssignment[]
}

export type GenerateRepairCandidatesContext = {
  defect: RankedV2RepairDefect
  allocations: PCAAllocation[]
  pcaPool: PCAData[]
  teamPrefs: Record<Team, TeamPreferenceInfo>
}

const VALID_SLOTS: Slot[] = [1, 2, 3, 4]

function cloneAllocations(allocations: PCAAllocation[]): PCAAllocation[] {
  return allocations.map((allocation) => ({ ...allocation }))
}

function getAllocationByStaffId(
  allocations: PCAAllocation[],
  staffId: string
): PCAAllocation | undefined {
  return allocations.find((allocation) => allocation.staff_id === staffId)
}

function getPcaById(pcaPool: PCAData[], pcaId: string): PCAData | undefined {
  return pcaPool.find((pca) => pca.id === pcaId)
}

function getSlotOwner(allocation: PCAAllocation | undefined, slot: Slot): Team | null {
  if (!allocation) return null
  if (slot === 1) return allocation.slot1
  if (slot === 2) return allocation.slot2
  if (slot === 3) return allocation.slot3
  return allocation.slot4
}

function setSlotOwner(allocation: PCAAllocation, slot: Slot, team: Team | null): void {
  if (slot === 1) allocation.slot1 = team
  else if (slot === 2) allocation.slot2 = team
  else if (slot === 3) allocation.slot3 = team
  else allocation.slot4 = team
}

function getOrCreateRepairAllocation(
  allocations: PCAAllocation[],
  pcaPool: PCAData[],
  pcaId: string,
  team: Team | null
): PCAAllocation | null {
  const existing = getAllocationByStaffId(allocations, pcaId)
  if (existing) return existing

  const pca = getPcaById(pcaPool, pcaId)
  if (!pca) return null

  const created: PCAAllocation = {
    id: `repair-${String(pca.id)}`,
    schedule_id: '',
    staff_id: pca.id,
    team: team ?? 'FO',
    fte_pca: pca.fte_pca,
    fte_remaining: pca.fte_pca,
    slot_assigned: 0,
    slot_whole: null,
    slot1: null,
    slot2: null,
    slot3: null,
    slot4: null,
    leave_type: pca.leave_type,
    special_program_ids: null,
  }
  allocations.push(created)
  return created
}

function getNormalizedAvailableSlots(pca: PCAData): Slot[] {
  if (!Array.isArray(pca.availableSlots)) return [...VALID_SLOTS]
  return pca.availableSlots.filter((slot): slot is Slot =>
    slot === 1 || slot === 2 || slot === 3 || slot === 4
  )
}

function countAssignedSlots(allocation: PCAAllocation): number {
  return VALID_SLOTS.filter((slot) => getSlotOwner(allocation, slot) != null).length
}

function updateDerivedAllocationFields(allocation: PCAAllocation): void {
  const assignedSlots = countAssignedSlots(allocation)
  allocation.slot_assigned = assignedSlots * 0.25
  allocation.fte_remaining = Math.max(0, allocation.fte_pca - allocation.slot_assigned)
}

function isAllocationWithinCapacity(allocation: PCAAllocation): boolean {
  return countAssignedSlots(allocation) * 0.25 <= allocation.fte_pca + 1e-9
}

function isSlotAllowedForTeam(
  team: Team,
  slot: Slot,
  teamPrefs: Record<Team, TeamPreferenceInfo>
): boolean {
  const pref = teamPrefs[team]
  if (!pref) return false
  if (pref.avoidGym && pref.gymSlot === slot) return false
  return true
}

function getAssignedSlotsForTeam(allocations: PCAAllocation[], team: Team): Slot[] {
  const slots: Slot[] = []
  for (const allocation of allocations) {
    for (const slot of VALID_SLOTS) {
      if (getSlotOwner(allocation, slot) === team) {
        slots.push(slot)
      }
    }
  }
  return slots.sort((a, b) => a - b)
}

function getAssignedFloatingSlotsForTeam(
  allocations: PCAAllocation[],
  team: Team,
  floatingPcaIds: Set<string>
): Slot[] {
  const slots: Slot[] = []
  for (const allocation of allocations) {
    if (!floatingPcaIds.has(allocation.staff_id)) continue
    for (const slot of VALID_SLOTS) {
      if (getSlotOwner(allocation, slot) === team) {
        slots.push(slot)
      }
    }
  }
  return slots.sort((a, b) => a - b)
}

function getRankedMissingSlots(
  allocations: PCAAllocation[],
  team: Team,
  teamPrefs: Record<Team, TeamPreferenceInfo>
): Slot[] {
  const current = new Set(getAssignedSlotsForTeam(allocations, team))
  return teamPrefs[team].rankedSlots.filter(
    (slot): slot is Slot =>
      (slot === 1 || slot === 2 || slot === 3 || slot === 4) && !current.has(slot)
  )
}

function getTeamPcaIds(allocations: PCAAllocation[], team: Team): string[] {
  const ids = new Set<string>()
  for (const allocation of allocations) {
    if (VALID_SLOTS.some((slot) => getSlotOwner(allocation, slot) === team)) {
      ids.add(allocation.staff_id)
    }
  }
  return [...ids].sort((a, b) => a.localeCompare(b))
}

function buildFloatingPcaIdSet(pcaPool: PCAData[]): Set<string> {
  return new Set(pcaPool.map((pca) => pca.id))
}

function buildRepairAssignments(
  before: PCAAllocation[],
  after: PCAAllocation[]
): RepairAssignment[] {
  const assignments: RepairAssignment[] = []
  const beforeByStaff = new Map(before.map((allocation) => [allocation.staff_id, allocation]))
  for (const allocation of [...after].sort((a, b) => String(a.staff_id).localeCompare(String(b.staff_id)))) {
    const previous = beforeByStaff.get(allocation.staff_id)
    for (const slot of VALID_SLOTS) {
      const previousOwner = getSlotOwner(previous, slot)
      const nextOwner = getSlotOwner(allocation, slot)
      if (nextOwner != null && nextOwner !== previousOwner) {
        assignments.push({
          team: nextOwner,
          pcaId: allocation.staff_id,
          slot,
        })
      }
    }
  }
  return assignments
}

function applyUpdates(
  allocations: PCAAllocation[],
  pcaPool: PCAData[],
  updates: SlotOwnerUpdate[]
): PCAAllocation[] | null {
  const next = cloneAllocations(allocations)
  for (const update of updates) {
    const allocation =
      getAllocationByStaffId(next, update.pcaId) ??
      getOrCreateRepairAllocation(next, pcaPool, update.pcaId, update.toTeam)
    if (!allocation) return null
    if (getSlotOwner(allocation, update.slot) !== update.fromTeam) {
      return null
    }
    setSlotOwner(allocation, update.slot, update.toTeam)
    updateDerivedAllocationFields(allocation)
    if (!isAllocationWithinCapacity(allocation)) {
      return null
    }
  }
  return next
}

function buildCandidate(
  defectKind: RankedV2RepairDefect['kind'],
  sortKey: string,
  allocations: PCAAllocation[],
  pcaPool: PCAData[],
  updates: SlotOwnerUpdate[]
): RepairCandidate | null {
  const next = applyUpdates(allocations, pcaPool, updates)
  if (!next) return null
  return {
    defectKind,
    reason: defectKind,
    sortKey,
    allocations: next,
    repairAssignments: buildRepairAssignments(allocations, next),
  }
}

export function applyOneSlotMove(args: {
  defectKind: RankedV2RepairDefect['kind']
  sortKey: string
  allocations: PCAAllocation[]
  pcaPool: PCAData[]
  targetPcaId: string
  targetSlot: Slot
  fromTeam: Team
  toTeam: Team
  fallbackPcaId?: string
  fallbackSlot?: Slot
  fallbackTeam?: Team
}): RepairCandidate | null {
  const updates: SlotOwnerUpdate[] = [
    {
      pcaId: args.targetPcaId,
      slot: args.targetSlot,
      fromTeam: args.fromTeam,
      toTeam: args.toTeam,
    },
  ]

  if (args.fallbackPcaId && args.fallbackSlot && args.fallbackTeam) {
    updates.push({
      pcaId: args.fallbackPcaId,
      slot: args.fallbackSlot,
      fromTeam: null,
      toTeam: args.fallbackTeam,
    })
  }

  return buildCandidate(args.defectKind, args.sortKey, args.allocations, args.pcaPool, updates)
}

export function applyOneSlotSwap(args: {
  defectKind: RankedV2RepairDefect['kind']
  sortKey: string
  allocations: PCAAllocation[]
  pcaPool: PCAData[]
  targetPcaId: string
  targetSlot: Slot
  targetOwner: Team
  newTargetOwner: Team
  donorPcaId: string
  donorSlot: Slot
  donorOwner: Team
  newDonorOwner: Team
}): RepairCandidate | null {
  return buildCandidate(args.defectKind, args.sortKey, args.allocations, args.pcaPool, [
    {
      pcaId: args.targetPcaId,
      slot: args.targetSlot,
      fromTeam: args.targetOwner,
      toTeam: args.newTargetOwner,
    },
    {
      pcaId: args.donorPcaId,
      slot: args.donorSlot,
      fromTeam: args.donorOwner,
      toTeam: args.newDonorOwner,
    },
  ])
}

export function applyContinuityCollapse(args: {
  sortKey: string
  allocations: PCAAllocation[]
  team: Team
  targetPcaId: string
  pcaPool: PCAData[]
}): RepairCandidate | null {
  const targetPca = getPcaById(args.pcaPool, args.targetPcaId)
  const targetAllocation = getAllocationByStaffId(args.allocations, args.targetPcaId)
  if (!targetPca || !targetAllocation) return null

  const supportedSlots = getNormalizedAvailableSlots(targetPca)
  const updates: SlotOwnerUpdate[] = []

  for (const allocation of [...args.allocations].sort((a, b) =>
    String(a.staff_id).localeCompare(String(b.staff_id))
  )) {
    if (allocation.staff_id === args.targetPcaId) continue
    for (const slot of VALID_SLOTS) {
      if (getSlotOwner(allocation, slot) !== args.team) continue
      if (!supportedSlots.includes(slot)) return null
      if (getSlotOwner(targetAllocation, slot) != null) return null
      updates.push({
        pcaId: allocation.staff_id,
        slot,
        fromTeam: args.team,
        toTeam: null,
      })
      updates.push({
        pcaId: args.targetPcaId,
        slot,
        fromTeam: null,
        toTeam: args.team,
      })
    }
  }

  if (updates.length === 0) return null
  return buildCandidate('C1', args.sortKey, args.allocations, args.pcaPool, updates)
}

function isUsefulOpenSlotForTeam(
  allocations: PCAAllocation[],
  team: Team,
  slot: Slot,
  teamPrefs: Record<Team, TeamPreferenceInfo>
): boolean {
  if (!isSlotAllowedForTeam(team, slot, teamPrefs)) return false
  if (getAssignedSlotsForTeam(allocations, team).includes(slot)) return false
  const pref = teamPrefs[team]
  return pref.rankedSlots.includes(slot) || pref.unrankedNonGymSlots.includes(slot)
}

function isFairnessFloorRescueSlotForTeam(
  allocations: PCAAllocation[],
  team: Team,
  slot: Slot,
  teamPrefs: Record<Team, TeamPreferenceInfo>,
  floatingPcaIds: Set<string>
): boolean {
  const pref = teamPrefs[team]
  const isGymLastResort = pref.avoidGym && pref.gymSlot === slot
  if (!isGymLastResort && !isSlotAllowedForTeam(team, slot, teamPrefs)) return false
  return !getAssignedFloatingSlotsForTeam(allocations, team, floatingPcaIds).includes(slot)
}

function getFairnessFloorRescueSlots(
  team: Team,
  teamPrefs: Record<Team, TeamPreferenceInfo>
): Slot[] {
  const pref = teamPrefs[team]
  const slots = [...pref.duplicateRankOrder.filter(isValidSlot)]
  if (pref.avoidGym && pref.gymSlot != null && isValidSlot(pref.gymSlot) && !slots.includes(pref.gymSlot)) {
    slots.push(pref.gymSlot)
  }
  return slots
}

function isValidSlot(value: number): value is Slot {
  return value === 1 || value === 2 || value === 3 || value === 4
}

function generateB1Candidates(context: GenerateRepairCandidatesContext): RepairCandidate[] {
  const { defect, allocations, pcaPool, teamPrefs } = context
  if (defect.kind !== 'B1') return []

  const requestingTeam = defect.team
  const candidates: RepairCandidate[] = []
  const sortedPcas = [...pcaPool].sort((a, b) => String(a.id).localeCompare(String(b.id)))
  const floatingPcaIds = buildFloatingPcaIdSet(pcaPool)

  for (const targetSlot of getRankedMissingSlots(allocations, requestingTeam, teamPrefs)) {
    for (const targetPca of sortedPcas) {
      if (!getNormalizedAvailableSlots(targetPca).includes(targetSlot)) continue
      const targetAllocation = getAllocationByStaffId(allocations, targetPca.id)
      const targetOwner = getSlotOwner(targetAllocation, targetSlot)
      if (!targetOwner || targetOwner === requestingTeam) continue

      for (const fallbackPca of sortedPcas) {
        const fallbackAllocation = getAllocationByStaffId(allocations, fallbackPca.id)
        const supportedSlots = getNormalizedAvailableSlots(fallbackPca)
        for (const fallbackSlot of teamPrefs[targetOwner].duplicateRankOrder) {
          if (
            fallbackSlot !== 1 &&
            fallbackSlot !== 2 &&
            fallbackSlot !== 3 &&
            fallbackSlot !== 4
          ) {
            continue
          }
          if (!supportedSlots.includes(fallbackSlot)) continue
          if (!isUsefulOpenSlotForTeam(allocations, targetOwner, fallbackSlot, teamPrefs)) continue
          if (getSlotOwner(fallbackAllocation, fallbackSlot) != null) continue

          const candidate = applyOneSlotMove({
            defectKind: 'B1',
            sortKey: `b1:move:${targetPca.id}:${targetSlot}:${fallbackPca.id}:${fallbackSlot}`,
            allocations,
            pcaPool,
            targetPcaId: targetPca.id,
            targetSlot,
            fromTeam: targetOwner,
            toTeam: requestingTeam,
            fallbackPcaId: fallbackPca.id,
            fallbackSlot,
            fallbackTeam: targetOwner,
          })
          if (candidate) candidates.push(candidate)
        }
      }

      for (const donorAllocation of [...allocations].sort((a, b) =>
        String(a.staff_id).localeCompare(String(b.staff_id))
      )) {
        if (!floatingPcaIds.has(donorAllocation.staff_id)) continue
        if (donorAllocation.staff_id === targetPca.id) continue
        for (const donorSlot of VALID_SLOTS) {
          if (getSlotOwner(donorAllocation, donorSlot) !== requestingTeam) continue
          if (!isUsefulOpenSlotForTeam(allocations, targetOwner, donorSlot, teamPrefs)) continue
          const candidate = applyOneSlotSwap({
            defectKind: 'B1',
            sortKey: `b1:swap:${targetPca.id}:${targetSlot}:${donorAllocation.staff_id}:${donorSlot}`,
            allocations,
            pcaPool,
            targetPcaId: targetPca.id,
            targetSlot,
            targetOwner,
            newTargetOwner: requestingTeam,
            donorPcaId: donorAllocation.staff_id,
            donorSlot,
            donorOwner: requestingTeam,
            newDonorOwner: targetOwner,
          })
          if (candidate) candidates.push(candidate)
        }
      }
    }
  }

  return candidates
}

function generateA1Candidates(context: GenerateRepairCandidatesContext): RepairCandidate[] {
  const { defect, allocations, teamPrefs } = context
  if (defect.kind !== 'A1') return []

  const duplicateTeam = defect.team
  const candidates: RepairCandidate[] = []
  const teamSlots = getAssignedSlotsForTeam(allocations, duplicateTeam)
  const duplicateSlots = [...new Set(teamSlots.filter((slot, index) => teamSlots.indexOf(slot) !== index))].sort(
    (a, b) => a - b
  )
  const floatingPcaIds = buildFloatingPcaIdSet(context.pcaPool)

  for (const slot of duplicateSlots) {
    for (const allocation of [...allocations].sort((a, b) =>
      String(a.staff_id).localeCompare(String(b.staff_id))
    )) {
      if (!floatingPcaIds.has(allocation.staff_id)) continue
      if (getSlotOwner(allocation, slot) !== duplicateTeam) continue
      for (const rescueTeam of (Object.keys(teamPrefs) as Team[]).sort((a, b) =>
        a.localeCompare(b)
      )) {
        if (rescueTeam === duplicateTeam) continue
        if (!isUsefulOpenSlotForTeam(allocations, rescueTeam, slot, teamPrefs)) continue

        const candidate = buildCandidate(
          'A1',
          `a1:${allocation.staff_id}:${slot}:${duplicateTeam}->${rescueTeam}`,
          allocations,
          context.pcaPool,
          [
            {
              pcaId: allocation.staff_id,
              slot,
              fromTeam: duplicateTeam,
              toTeam: rescueTeam,
            },
          ]
        )
        if (candidate) candidates.push(candidate)
      }
    }
  }

  return candidates
}

function generateA2Candidates(context: GenerateRepairCandidatesContext): RepairCandidate[] {
  const { defect, allocations, pcaPool, teamPrefs } = context
  if (defect.kind !== 'A2') return []

  const targetAllocation = getAllocationByStaffId(allocations, defect.pcaId)
  if (!targetAllocation) return []

  const targetPca = getPcaById(pcaPool, defect.pcaId)
  if (!targetPca) return []

  const candidates: RepairCandidate[] = []
  const supportedSlots = getNormalizedAvailableSlots(targetPca)
  const orderedTeams = (Object.keys(teamPrefs) as Team[]).sort((a, b) => a.localeCompare(b))

  for (const rescueTeam of orderedTeams) {
    if (rescueTeam === defect.team) continue
    const rescuePref = teamPrefs[rescueTeam]
    const preferredPathSlots = rescuePref.preferredPCAIds.includes(defect.pcaId)
      ? rescuePref.unrankedNonGymSlots.filter(
          (slot): slot is Slot => slot === 1 || slot === 2 || slot === 3 || slot === 4
        )
      : []
    const rescueSlots = [...new Set([...rescuePref.rankedSlots, ...preferredPathSlots])]

    for (const slot of rescueSlots) {
      if (slot !== 1 && slot !== 2 && slot !== 3 && slot !== 4) continue
      if (!supportedSlots.includes(slot)) continue
      if (!isUsefulOpenSlotForTeam(allocations, rescueTeam, slot, teamPrefs)) continue

      if (getSlotOwner(targetAllocation, slot) === defect.team) {
        const directCandidate = buildCandidate(
          'A2',
          `a2:direct:${defect.pcaId}:${slot}:${defect.team}->${rescueTeam}`,
          allocations,
          pcaPool,
          [
            {
              pcaId: defect.pcaId,
              slot,
              fromTeam: defect.team,
              toTeam: rescueTeam,
            },
          ]
        )
        if (directCandidate) candidates.push(directCandidate)
      }

      for (const ownedSlot of VALID_SLOTS) {
        if (getSlotOwner(targetAllocation, ownedSlot) !== defect.team) continue

        const fallbackCandidate = buildFallbackMoveCandidate({
          defectKind: 'A2',
          sortPrefix: 'a2',
          allocations,
          pcaPool,
          teamPrefs,
          sourcePcaId: defect.pcaId,
          sourceSlot: ownedSlot,
          sourceTeam: defect.team,
          rescuePcaId: defect.pcaId,
          rescueSlot: slot,
          rescueTeam,
        })
        if (fallbackCandidate) candidates.push(fallbackCandidate)
      }
    }
  }

  return candidates
}

function generateF1Candidates(context: GenerateRepairCandidatesContext): RepairCandidate[] {
  const { defect, allocations, pcaPool, teamPrefs } = context
  if (defect.kind !== 'F1') return []

  const candidates: RepairCandidate[] = []
  const orderedAllocations = [...allocations].sort((a, b) => String(a.staff_id).localeCompare(String(b.staff_id)))
  const floatingPcaIds = buildFloatingPcaIdSet(pcaPool)

  for (const rescueSlot of getFairnessFloorRescueSlots(defect.team, teamPrefs)) {
    if (
      !isFairnessFloorRescueSlotForTeam(
        allocations,
        defect.team,
        rescueSlot,
        teamPrefs,
        floatingPcaIds
      )
    ) {
      continue
    }

    for (const rescuePca of [...pcaPool].sort((a, b) => String(a.id).localeCompare(String(b.id)))) {
      if (!getNormalizedAvailableSlots(rescuePca).includes(rescueSlot)) continue

      const rescueAllocation = getAllocationByStaffId(allocations, rescuePca.id)
      const rescueOwner = getSlotOwner(rescueAllocation, rescueSlot)

      if (rescueOwner == null) {
        const candidate = buildCandidate(
          'F1',
          `f1:open:${rescuePca.id}:${rescueSlot}:${defect.team}`,
          allocations,
          pcaPool,
          [
            {
              pcaId: rescuePca.id,
              slot: rescueSlot,
              fromTeam: null,
              toTeam: defect.team,
            },
          ]
        )
        if (candidate) candidates.push(candidate)
        continue
      }

      if (rescueOwner === defect.team) continue

      for (const donorAllocation of orderedAllocations) {
        if (!floatingPcaIds.has(donorAllocation.staff_id)) continue
        if (donorAllocation.staff_id === rescuePca.id) continue
        for (const donorSlot of VALID_SLOTS) {
          if (getSlotOwner(donorAllocation, donorSlot) !== defect.team) continue
          if (!isUsefulOpenSlotForTeam(allocations, rescueOwner, donorSlot, teamPrefs)) continue
          const candidate = applyOneSlotSwap({
            defectKind: 'F1',
            sortKey: `f1:swap:${rescuePca.id}:${rescueSlot}:${donorAllocation.staff_id}:${donorSlot}`,
            allocations,
            pcaPool,
            targetPcaId: rescuePca.id,
            targetSlot: rescueSlot,
            targetOwner: rescueOwner,
            newTargetOwner: defect.team,
            donorPcaId: donorAllocation.staff_id,
            donorSlot,
            donorOwner: defect.team,
            newDonorOwner: rescueOwner,
          })
          if (candidate) candidates.push(candidate)
        }
      }

      const fallbackCandidate = buildFallbackMoveCandidate({
        defectKind: 'F1',
        sortPrefix: 'f1',
        allocations,
        pcaPool,
        teamPrefs,
        sourcePcaId: rescuePca.id,
        sourceSlot: rescueSlot,
        sourceTeam: rescueOwner,
        rescuePcaId: rescuePca.id,
        rescueSlot,
        rescueTeam: defect.team,
      })
      if (fallbackCandidate) candidates.push(fallbackCandidate)
    }
  }

  return candidates
}

function buildFallbackMoveCandidate(args: {
  defectKind: RankedV2RepairDefect['kind']
  sortPrefix: string
  allocations: PCAAllocation[]
  pcaPool: PCAData[]
  teamPrefs: Record<Team, TeamPreferenceInfo>
  sourcePcaId: string
  sourceSlot: Slot
  sourceTeam: Team
  rescuePcaId: string
  rescueSlot: Slot
  rescueTeam: Team
}): RepairCandidate | null {
  const sortedPcas = [...args.pcaPool].sort((a, b) => String(a.id).localeCompare(String(b.id)))
  for (const fallbackPca of sortedPcas) {
    const fallbackAllocation = getAllocationByStaffId(args.allocations, fallbackPca.id)
    const supportedSlots = getNormalizedAvailableSlots(fallbackPca)
    for (const fallbackSlot of args.teamPrefs[args.sourceTeam].duplicateRankOrder) {
      if (fallbackSlot !== 1 && fallbackSlot !== 2 && fallbackSlot !== 3 && fallbackSlot !== 4) {
        continue
      }
      if (!supportedSlots.includes(fallbackSlot)) continue
      if (!isUsefulOpenSlotForTeam(args.allocations, args.sourceTeam, fallbackSlot, args.teamPrefs)) continue
      if (getSlotOwner(fallbackAllocation, fallbackSlot) != null) continue

      const candidate = applyOneSlotMove({
        defectKind: args.defectKind,
        sortKey: `${args.sortPrefix}:move:${args.sourcePcaId}:${args.sourceSlot}:${fallbackPca.id}:${fallbackSlot}:${args.rescueTeam}`,
        allocations: args.allocations,
        pcaPool: args.pcaPool,
        targetPcaId: args.sourcePcaId,
        targetSlot: args.sourceSlot,
        fromTeam: args.sourceTeam,
        toTeam: args.rescueTeam,
        fallbackPcaId: fallbackPca.id,
        fallbackSlot,
        fallbackTeam: args.sourceTeam,
      })
      if (candidate) return candidate
    }
  }

  return null
}

function generateC1Candidates(context: GenerateRepairCandidatesContext): RepairCandidate[] {
  const { defect, allocations, pcaPool } = context
  if (defect.kind !== 'C1') return []

  const team = defect.team
  const floatingPcaIds = buildFloatingPcaIdSet(pcaPool)
  const teamPcaIds = getTeamPcaIds(allocations, team).filter((pcaId) => floatingPcaIds.has(pcaId))
  const candidates: RepairCandidate[] = []

  for (const targetPcaId of teamPcaIds) {
    const candidate = applyContinuityCollapse({
      sortKey: `c1:${targetPcaId}:${team}`,
      allocations,
      team,
      targetPcaId,
      pcaPool,
    })
    if (candidate) candidates.push(candidate)
  }

  return candidates
}

export function generateRepairCandidates(
  context: GenerateRepairCandidatesContext
): RepairCandidate[] {
  const candidates =
    context.defect.kind === 'B1'
      ? generateB1Candidates(context)
      : context.defect.kind === 'A1'
        ? generateA1Candidates(context)
        : context.defect.kind === 'A2'
          ? generateA2Candidates(context)
        : context.defect.kind === 'C1'
          ? generateC1Candidates(context)
          : context.defect.kind === 'F1'
            ? generateF1Candidates(context)
          : []

  candidates.sort((a, b) => a.sortKey.localeCompare(b.sortKey))
  return candidates
}
