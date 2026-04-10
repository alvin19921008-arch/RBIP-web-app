import type { Team } from '@/types/staff'
import type { AllocationTracker, PCAAllocation, SlotAssignmentLog } from '@/types/schedule'
import type { PCAData } from '@/lib/algorithms/pcaAllocationTypes'
import { roundToNearestQuarterWithMidpoint } from '@/lib/utils/rounding'
import {
  assignOneSlotAndUpdatePending,
  findAvailablePCAs,
  getAvailableSlotsForTeam,
  getOrCreateAllocation,
  getTeamExistingSlots,
  isFloorPCAForTeam,
  type TeamPreferenceInfo,
} from '@/lib/utils/floatingPCAHelpers'

type RankedSlotSelectionPhase =
  | 'ranked-unused'
  | 'unranked-unused'
  | 'ranked-duplicate'
  | 'gym-last-resort'

type RankedPcaTier = 'preferred' | 'floor' | 'non-floor'

type RankedTarget = {
  phase: RankedSlotSelectionPhase
  slot: 1 | 2 | 3 | 4
  futureSlots: Array<1 | 2 | 3 | 4>
}

const VALID_SLOTS: Array<1 | 2 | 3 | 4> = [1, 2, 3, 4]

function toValidRankedSlot(value: number): 1 | 2 | 3 | 4 | null {
  if (value === 1 || value === 2 || value === 3 || value === 4) return value
  return null
}

function findAllocationByStaffId(
  allocations: PCAAllocation[],
  staffId: string
): PCAAllocation | undefined {
  return allocations.find((allocation) => allocation.staff_id === staffId)
}

function getSlotOwner(allocation: PCAAllocation | undefined, slot: 1 | 2 | 3 | 4): Team | null {
  if (!allocation) return null
  if (slot === 1) return allocation.slot1
  if (slot === 2) return allocation.slot2
  if (slot === 3) return allocation.slot3
  return allocation.slot4
}

function buildTrueStep3OwnedSlotCount(args: {
  team: Team
  allocations: PCAAllocation[]
  floatingPcaIds: Set<string>
  baselineAllocations?: PCAAllocation[]
}): Map<1 | 2 | 3 | 4, number> {
  const baselineByStaffId = new Map(
    (args.baselineAllocations ?? []).map((allocation) => [allocation.staff_id, allocation])
  )
  const counts = new Map<1 | 2 | 3 | 4>([
    [1, 0],
    [2, 0],
    [3, 0],
    [4, 0],
  ])

  for (const allocation of args.allocations) {
    if (!args.floatingPcaIds.has(allocation.staff_id)) continue
    const baselineAllocation = baselineByStaffId.get(allocation.staff_id)
    for (const slot of VALID_SLOTS) {
      if (getSlotOwner(allocation, slot) !== args.team) continue
      if (getSlotOwner(baselineAllocation, slot) === args.team) continue
      counts.set(slot, (counts.get(slot) ?? 0) + 1)
    }
  }

  return counts
}

function buildRankedTargets(args: {
  team: Team
  pref: TeamPreferenceInfo
  allocations: PCAAllocation[]
  floatingPcaIds: Set<string>
  baselineAllocations?: PCAAllocation[]
}): RankedTarget[] {
  const { team, pref, allocations, floatingPcaIds, baselineAllocations } = args
  const slotCounts = buildTrueStep3OwnedSlotCount({
    team,
    allocations,
    floatingPcaIds,
    baselineAllocations,
  })

  const isUsed = (slot: number): boolean => {
    const validSlot = toValidRankedSlot(slot)
    if (!validSlot) return false
    return (slotCounts.get(validSlot) ?? 0) > 0
  }
  const isGym = (slot: number): boolean => pref.gymSlot != null && slot === pref.gymSlot

  const rankedUnused = pref.rankedSlots
    .filter((slot) => !isUsed(slot))
    .filter((slot) => !(pref.avoidGym && isGym(slot)))
    .map((slot) => toValidRankedSlot(slot))
    .filter((slot): slot is 1 | 2 | 3 | 4 => slot != null)

  const unrankedUnused = pref.unrankedNonGymSlots
    .filter((slot) => !isUsed(slot))
    .map((slot) => toValidRankedSlot(slot))
    .filter((slot): slot is 1 | 2 | 3 | 4 => slot != null)

  const rankedDuplicates = pref.duplicateRankOrder
    .filter((slot) => isUsed(slot))
    .map((slot) => toValidRankedSlot(slot))
    .filter((slot): slot is 1 | 2 | 3 | 4 => slot != null)

  const gymLastResort =
    pref.avoidGym && pref.gymSlot != null && toValidRankedSlot(pref.gymSlot) != null
      ? [toValidRankedSlot(pref.gymSlot)!]
      : []

  const phases: Array<{ phase: RankedSlotSelectionPhase; slots: Array<1 | 2 | 3 | 4> }> = [
    { phase: 'ranked-unused', slots: rankedUnused },
    { phase: 'unranked-unused', slots: unrankedUnused },
    { phase: 'ranked-duplicate', slots: rankedDuplicates },
    { phase: 'gym-last-resort', slots: gymLastResort },
  ]

  const flattened = phases.flatMap(({ slots }) => slots)
  let offset = 0
  const targets: RankedTarget[] = []

  for (const bucket of phases) {
    for (let i = 0; i < bucket.slots.length; i += 1) {
      const slot = bucket.slots[i]
      targets.push({
        phase: bucket.phase,
        slot,
        futureSlots: flattened.slice(offset + i + 1),
      })
    }
    offset += bucket.slots.length
  }

  return targets
}

function getRankTierForPca(pca: PCAData, pref: TeamPreferenceInfo): RankedPcaTier {
  if (pref.preferredPCAIds.includes(pca.id)) return 'preferred'
  if (isFloorPCAForTeam(pca, pref.teamFloor)) return 'floor'
  return 'non-floor'
}

function getRankTierWeight(tier: RankedPcaTier): number {
  if (tier === 'preferred') return 0
  if (tier === 'floor') return 1
  return 2
}

function getUsableSlotsForPca(args: {
  pca: PCAData
  allocations: PCAAllocation[]
  gymSlot: number | null
  avoidGym: boolean
}): Array<1 | 2 | 3 | 4> {
  const { pca, allocations, gymSlot, avoidGym } = args
  const allocation = findAllocationByStaffId(allocations, pca.id)
  const remainingFte = allocation?.fte_remaining ?? pca.fte_pca
  if (remainingFte < 0.25) return []

  const baseAvailable = allocation
    ? getAvailableSlotsForTeam(allocation, gymSlot, avoidGym)
    : VALID_SLOTS.filter((slot) => !(avoidGym && gymSlot === slot))

  if (!Array.isArray(pca.availableSlots)) {
    return baseAvailable
  }

  const normalizedAvailable = pca.availableSlots.filter(
    (slot): slot is 1 | 2 | 3 | 4 => slot === 1 || slot === 2 || slot === 3 || slot === 4
  )
  if (normalizedAvailable.length === 0) return []

  return baseAvailable.filter((slot) => normalizedAvailable.includes(slot))
}

function pickRankedCandidateForTarget(args: {
  team: Team
  target: RankedTarget
  pref: TeamPreferenceInfo
  allocations: PCAAllocation[]
  pendingFTE: Record<Team, number>
  pcaPool: PCAData[]
}): {
  pca: PCAData
  tier: RankedPcaTier
} | null {
  const { team, target, pref, allocations, pendingFTE, pcaPool } = args
  const avoidGym = target.phase === 'gym-last-resort' ? false : pref.avoidGym
  const gymSlot = pref.gymSlot ?? null

  const candidates = findAvailablePCAs({
    pcaPool,
    team,
    teamFloor: pref.teamFloor,
    floorMatch: 'any',
    excludePreferredOfOtherTeams: false,
    preferredPCAIdsOfOtherTeams: new Map<string, Team[]>(),
    pendingFTEPerTeam: pendingFTE,
    requiredSlot: target.slot,
    existingAllocations: allocations,
    gymSlot,
    avoidGym,
  })

  if (candidates.length === 0) return null

  const scored = candidates.map((pca) => {
    const tier = getRankTierForPca(pca, pref)
    const remainingFte = findAllocationByStaffId(allocations, pca.id)?.fte_remaining ?? pca.fte_pca
    const usableSlots = getUsableSlotsForPca({
      pca,
      allocations,
      gymSlot,
      avoidGym,
    })
    const canContinueUsefully = target.futureSlots.some((slot) => usableSlots.includes(slot))

    return {
      pca,
      tier,
      remainingFte,
      canContinueUsefully,
    }
  })

  scored.sort((a, b) => {
    if (a.canContinueUsefully !== b.canContinueUsefully) {
      return a.canContinueUsefully ? -1 : 1
    }

    const tierDiff = getRankTierWeight(a.tier) - getRankTierWeight(b.tier)
    if (tierDiff !== 0) return tierDiff

    if (b.remainingFte !== a.remainingFte) return b.remainingFte - a.remainingFte
    return String(a.pca.id).localeCompare(String(b.pca.id))
  })

  const winner = scored[0]
  if (!winner) return null

  return {
    pca: winner.pca,
    tier: winner.tier,
  }
}

function findContinuityTarget(args: {
  team: Team
  pref: TeamPreferenceInfo
  allocations: PCAAllocation[]
  pca: PCAData
  floatingPcaIds: Set<string>
  baselineAllocations?: PCAAllocation[]
}): RankedTarget | null {
  const { team, pref, allocations, pca, floatingPcaIds, baselineAllocations } = args
  const targets = buildRankedTargets({
    team,
    pref,
    allocations,
    floatingPcaIds,
    baselineAllocations,
  })

  for (const target of targets) {
    const avoidGym = target.phase === 'gym-last-resort' ? false : pref.avoidGym
    const usableSlots = getUsableSlotsForPca({
      pca,
      allocations,
      gymSlot: pref.gymSlot ?? null,
      avoidGym,
    })
    if (usableSlots.includes(target.slot)) {
      return target
    }
  }

  return null
}

function recordDraftAssignment(args: {
  team: Team
  pref: TeamPreferenceInfo
  target: RankedTarget
  pca: PCAData
  tier: RankedPcaTier
  result: { slotsAssigned: number[]; amPmBalanced: boolean }
  usedContinuity: boolean
  recordAssignmentWithOrder: (team: Team, log: SlotAssignmentLog) => void
}): void {
  const { team, pref, target, pca, tier, result, usedContinuity, recordAssignmentWithOrder } = args
  const assignedSlot = result.slotsAssigned[0]
  if (assignedSlot !== 1 && assignedSlot !== 2 && assignedSlot !== 3 && assignedSlot !== 4) return

  const rankIndex = pref.rankedSlots.indexOf(assignedSlot)

  recordAssignmentWithOrder(team, {
    slot: assignedSlot,
    pcaId: pca.id,
    pcaName: pca.name,
    assignedIn: 'step34',
    step3OwnershipKind: 'step3-floating',
    cycle: 1,
    wasPreferredSlot: assignedSlot === (pref.preferredSlot ?? -1),
    wasPreferredPCA: tier === 'preferred',
    wasFloorPCA: tier === 'floor' ? true : tier === 'non-floor' ? false : undefined,
    amPmBalanceAchieved: result.amPmBalanced,
    gymSlotAvoided: pref.gymSlot != null ? assignedSlot !== pref.gymSlot : undefined,
    fulfilledSlotRank: rankIndex >= 0 ? rankIndex + 1 : null,
    slotSelectionPhase: target.phase,
    pcaSelectionTier: tier,
    usedContinuity,
    duplicateSlot: target.phase === 'ranked-duplicate',
  })
}

export function runRankedV2DraftAllocation(args: {
  teamOrder: Team[]
  pendingFTE: Record<Team, number>
  allocations: PCAAllocation[]
  pcaPool: PCAData[]
  teamPrefs: Record<Team, TeamPreferenceInfo>
  tracker: AllocationTracker
  recordAssignmentWithOrder: (team: Team, log: SlotAssignmentLog) => void
  baselineAllocations?: PCAAllocation[]
}): void {
  const { teamOrder, pendingFTE, allocations, pcaPool, teamPrefs, recordAssignmentWithOrder, baselineAllocations } =
    args
  const floatingPcaIds = new Set(pcaPool.map((candidate) => candidate.id))

  for (const team of teamOrder) {
    const pref = teamPrefs[team]
    let continuityPcaId: string | null = null

    while (roundToNearestQuarterWithMidpoint(pendingFTE[team] ?? 0) >= 0.25) {
      const continuityPca =
        continuityPcaId == null ? null : pcaPool.find((candidate) => candidate.id === continuityPcaId) ?? null

      if (continuityPca) {
        const continuityTarget = findContinuityTarget({
          team,
          pref,
          allocations,
          pca: continuityPca,
          floatingPcaIds,
          baselineAllocations,
        })

        if (continuityTarget) {
          const allocation = getOrCreateAllocation(
            continuityPca.id,
            continuityPca.name,
            continuityPca.fte_pca,
            continuityPca.leave_type,
            team,
            allocations
          )
          const avoidGym = continuityTarget.phase === 'gym-last-resort' ? false : pref.avoidGym
          const result = assignOneSlotAndUpdatePending({
            pca: continuityPca,
            allocation,
            team,
            teamExistingSlots: getTeamExistingSlots(team, allocations),
            gymSlot: pref.gymSlot ?? null,
            avoidGym,
            preferredSlot: continuityTarget.slot,
            pendingFTEByTeam: pendingFTE,
            context: 'Cleanup pass → one slot at a time',
          })

          if (result.slotsAssigned.length > 0) {
            recordDraftAssignment({
              team,
              pref,
              target: continuityTarget,
              pca: continuityPca,
              tier: getRankTierForPca(continuityPca, pref),
              result,
              usedContinuity: true,
              recordAssignmentWithOrder,
            })
            continue
          }
        }
      }

      const targets = buildRankedTargets({
        team,
        pref,
        allocations,
        floatingPcaIds,
        baselineAllocations,
      })
      if (targets.length === 0) break

      let winner:
        | {
            pca: PCAData
            tier: RankedPcaTier
          }
        | null = null
      let target: RankedTarget | null = null

      for (const candidateTarget of targets) {
        const candidateWinner = pickRankedCandidateForTarget({
          team,
          target: candidateTarget,
          pref,
          allocations,
          pendingFTE,
          pcaPool,
        })
        if (candidateWinner) {
          winner = candidateWinner
          target = candidateTarget
          break
        }
      }

      if (!winner || !target) break

      const allocation = getOrCreateAllocation(
        winner.pca.id,
        winner.pca.name,
        winner.pca.fte_pca,
        winner.pca.leave_type,
        team,
        allocations
      )
      const avoidGym = target.phase === 'gym-last-resort' ? false : pref.avoidGym
      const result = assignOneSlotAndUpdatePending({
        pca: winner.pca,
        allocation,
        team,
        teamExistingSlots: getTeamExistingSlots(team, allocations),
        gymSlot: pref.gymSlot ?? null,
        avoidGym,
        preferredSlot: target.slot,
        pendingFTEByTeam: pendingFTE,
        context: 'Cleanup pass → one slot at a time',
      })

      if (result.slotsAssigned.length === 0) break

      continuityPcaId = winner.pca.id
      recordDraftAssignment({
        team,
        pref,
        target,
        pca: winner.pca,
        tier: winner.tier,
        result,
        usedContinuity: false,
        recordAssignmentWithOrder,
      })
    }
  }
}
