import type { Team } from '@/types/staff'
import type { PCAAllocation, SlotAssignmentLog } from '@/types/schedule'
import type {
  FloatingPCAAllocationContextV2,
  FloatingPCAAllocationResultV2,
} from '@/lib/algorithms/floatingPcaShared/contracts'
import type { PCAData } from '@/lib/algorithms/pcaAllocationTypes'
import { buildUpstreamCoverageKindByTeamSlot } from '@/lib/algorithms/floatingPcaV2/provenance'
import {
  TEAMS,
  createEmptyTracker,
  recordAssignment,
  getTeamPreferenceInfo,
  findAvailablePCAs,
  getOrCreateAllocation,
  getTeamExistingSlots,
  assignSlotsToTeam,
  isFloorPCAForTeam,
  type TeamPreferenceInfo,
} from '@/lib/utils/floatingPCAHelpers'
import { applyInvalidSlotPairingForDisplay } from '@/lib/algorithms/floatingPcaShared/applyInvalidSlotPairingForDisplay'
import { finalizeRankedSlotFloatingTracker } from '@/lib/algorithms/floatingPcaV2/trackerSummaryDerivations'
import { buildEffectiveRankedPreferences } from '@/lib/algorithms/floatingPcaV2/effectivePreferences'
import { runRankedV2DraftAllocation } from '@/lib/algorithms/floatingPcaV2/draftAllocation'
import {
  detectRankedV2GymAvoidableDefects,
  detectRankedV2RepairDefects,
  type RankedV2RepairDefect,
} from '@/lib/algorithms/floatingPcaV2/repairAudit'
import {
  generateOptionalPromotionCandidates,
  generateRepairCandidates,
  runGymAvoidanceRepairLoop,
  MAX_GYM_AVOIDANCE_REPAIR_ITERATIONS,
  type Step3CommittedFloatingAnchor,
} from '@/lib/algorithms/floatingPcaV2/repairMoves'
import {
  buildRankedSlotAllocationScore,
  compareScores,
} from '@/lib/algorithms/floatingPcaV2/scoreSchedule'
import { roundToNearestQuarterWithMidpoint } from '@/lib/utils/rounding'

/** Bounded iterations for required-repair loop (`runRepairLoop`). */
const MAX_REPAIR_ITERATIONS = 8
/** Part III gym-avoidance cap (=6); passed into `runGymAvoidanceRepairLoop` — Task Group C / Task C3 spec. */
const MAX_GYM_AVOIDANCE_REPAIR_ITERATIONS_ALLOCATOR = MAX_GYM_AVOIDANCE_REPAIR_ITERATIONS
const MAX_CANDIDATES_PER_DEFECT = 24

const RANKED_V2_REPAIR_SCORE_COMPARE_OPTIONS = { includeAmPmSessionBalanceTieBreak: true } as const
const RANKED_V2_PROMOTION_SCORE_COMPARE_OPTIONS = {
  includeOptionalPromotionTieBreak: true,
  includeAmPmSessionBalanceTieBreak: true,
} as const

function createEmptyPendingFTE(): Record<Team, number> {
  return {
    FO: 0,
    SMM: 0,
    SFM: 0,
    CPPC: 0,
    MC: 0,
    GMC: 0,
    NSM: 0,
    DRO: 0,
  }
}

function countAssignedSlotsByTeam(allocations: PCAAllocation[]): Record<Team, number> {
  const counts = createEmptyPendingFTE()
  for (const allocation of allocations) {
    if (allocation.slot1) counts[allocation.slot1] += 1
    if (allocation.slot2) counts[allocation.slot2] += 1
    if (allocation.slot3) counts[allocation.slot3] += 1
    if (allocation.slot4) counts[allocation.slot4] += 1
  }
  return counts
}

function computePendingFromAllocations(
  currentPendingFTE: Record<Team, number>,
  baselineAssignedSlots: Record<Team, number>,
  allocations: PCAAllocation[]
): Record<Team, number> {
  const finalAssignedCounts = countAssignedSlotsByTeam(allocations)

  const nextPending = createEmptyPendingFTE()
  for (const team of TEAMS) {
    const pendingSlotsAtStep34Start = Math.round(((currentPendingFTE[team] ?? 0) + 1e-9) / 0.25)
    const newlyCoveredSlots = finalAssignedCounts[team] - baselineAssignedSlots[team]
    const remainingSlots = Math.max(0, pendingSlotsAtStep34Start - newlyCoveredSlots)
    nextPending[team] = remainingSlots * 0.25
  }
  return nextPending
}

function getRepairReason(
  kind: RankedV2RepairDefect['kind']
): 'ranked-coverage' | 'fairness-floor' | 'duplicate-reduction' | 'continuity-reduction' | 'gym-avoidance' {
  if (kind === 'B1') return 'ranked-coverage'
  if (kind === 'C1') return 'continuity-reduction'
  if (kind === 'A1' || kind === 'A2') return 'duplicate-reduction'
  if (kind === 'G1') return 'gym-avoidance'
  return 'fairness-floor'
}

export async function allocateFloatingPCA_v2RankedSlotImpl(
  context: FloatingPCAAllocationContextV2
): Promise<FloatingPCAAllocationResultV2> {
  const {
    teamOrder,
    currentPendingFTE: initialPendingFTE,
    existingAllocations,
    pcaPool,
    pcaPreferences,
    extraCoverageMode = 'none',
    preferenceSelectionMode = 'legacy',
    selectedPreferenceAssignments = [],
    committedStep3Assignments = [],
  } = context

  const allocations = existingAllocations.map((allocation) => ({ ...allocation }))
  const pendingFTE = { ...initialPendingFTE }
  const tracker = createEmptyTracker()
  const extraCoverageByStaffId: Record<string, Array<1 | 2 | 3 | 4>> = {}

  const committedStep3Anchors: Step3CommittedFloatingAnchor[] = committedStep3Assignments
    .filter((row) => row.source === 'step32' || row.source === 'step33' || row.source == null)
    .map((row) => ({
      team: row.team,
      slot: row.slot as 1 | 2 | 3 | 4,
      pcaId: row.pcaId,
    }))

  for (const team of TEAMS) {
    tracker[team].summary.allocationMode = 'standard'
  }

  const allocationOrderMap = new Map<Team, number>()
  teamOrder.forEach((team, index) => {
    allocationOrderMap.set(team, index + 1)
  })

  const recordAssignmentWithOrder = (team: Team, log: Parameters<typeof recordAssignment>[2]) => {
    recordAssignment(tracker, team, {
      ...log,
      allocationOrder: allocationOrderMap.get(team),
    })
  }

  const useSelectedOnlyEffectivePreferences = preferenceSelectionMode === 'selected_only'
  const effectivePreferences = useSelectedOnlyEffectivePreferences
    ? buildEffectiveRankedPreferences(
        pcaPreferences,
        selectedPreferenceAssignments.map((assignment) => ({
          team: assignment.team,
          pcaId: assignment.pcaId,
        }))
      )
    : pcaPreferences
  const floatingPcaIds = new Set(pcaPool.map((pca) => pca.id))
  const upstreamCoverageByTeamSlot = buildUpstreamCoverageKindByTeamSlot({
    existingAllocations,
    floatingPcaIds,
    excludeStep3OwnedSelections: committedStep3Assignments.map((assignment) => ({
      team: assignment.team,
      slot: assignment.slot,
      pcaId: assignment.pcaId,
    })),
  })

  const teamPrefs: Record<Team, TeamPreferenceInfo> = {} as Record<Team, TeamPreferenceInfo>
  for (const team of TEAMS) {
    teamPrefs[team] = getTeamPreferenceInfo(team, effectivePreferences)
  }

  const baselineAssignedSlots = countAssignedSlotsByTeam(existingAllocations)
  const acceptedRepairReasons = new Map<
    string,
    | 'ranked-coverage'
    | 'fairness-floor'
    | 'duplicate-reduction'
    | 'continuity-reduction'
    | 'ranked-promotion'
    | 'gym-avoidance'
  >()

  runRankedV2DraftAllocation({
    teamOrder,
    pendingFTE,
    allocations,
    pcaPool,
    teamPrefs,
    tracker,
    recordAssignmentWithOrder,
    baselineAllocations: existingAllocations,
  })

  const setRepairAuditDefects = (defects: RankedV2RepairDefect[]) => {
    for (const team of TEAMS) {
      tracker[team].summary.repairAuditDefects = []
    }
    for (const defect of defects) {
      const current = tracker[defect.team].summary.repairAuditDefects ?? []
      if (!current.includes(defect.kind)) {
        current.push(defect.kind)
      }
      tracker[defect.team].summary.repairAuditDefects = current
    }
  }

  const sortDefects = (defects: RankedV2RepairDefect[]): RankedV2RepairDefect[] => {
    // G1 is Part III only and is never returned from detectRankedV2RepairDefects (6e); listed last so merged lists sort deterministically.
    const kindOrder: RankedV2RepairDefect['kind'][] = ['B1', 'F1', 'A1', 'A2', 'C1', 'G1']
    return [...defects].sort((a, b) => {
      const kindDiff = kindOrder.indexOf(a.kind) - kindOrder.indexOf(b.kind)
      if (kindDiff !== 0) return kindDiff
      const teamDiff = String(a.team).localeCompare(String(b.team))
      if (teamDiff !== 0) return teamDiff
      if (a.kind === 'A2' && b.kind === 'A2') {
        return a.pcaId.localeCompare(b.pcaId)
      }
      return 0
    })
  }

  let repairAuditDefects: RankedV2RepairDefect[] = []
  let bestScore = buildRankedSlotAllocationScore({
    allocations,
    initialPendingFTE,
    pendingFTE,
    teamOrder,
    defects: [],
    teamPrefs,
    baselineAllocations: existingAllocations,
    floatingPcaIds,
  })

  const runRepairLoop = () => {
    repairAuditDefects = detectRankedV2RepairDefects({
      teamOrder,
      initialPendingFTE: initialPendingFTE,
      pendingFTE,
      allocations,
      pcaPool,
      teamPrefs,
      baselineAllocations: existingAllocations,
    })
    setRepairAuditDefects(repairAuditDefects)

    bestScore = buildRankedSlotAllocationScore({
      allocations,
      initialPendingFTE,
      pendingFTE,
      teamOrder,
      defects: repairAuditDefects,
      teamPrefs,
      baselineAllocations: existingAllocations,
      floatingPcaIds,
    })

    for (let iteration = 0; iteration < MAX_REPAIR_ITERATIONS; iteration += 1) {
      let bestCandidate:
        | (ReturnType<typeof generateRepairCandidates>[number] & {
            score: ReturnType<typeof buildRankedSlotAllocationScore>
            pendingFTE: Record<Team, number>
            defects: RankedV2RepairDefect[]
          })
        | null = null

      for (const defect of sortDefects(repairAuditDefects)) {
        const candidates = generateRepairCandidates({
          defect,
          allocations,
          pcaPool,
          teamPrefs,
          teamOrder,
          initialPendingFTE,
          pendingFTE,
          baselineAllocations: existingAllocations,
          committedStep3Anchors,
        }).slice(0, MAX_CANDIDATES_PER_DEFECT)

        for (const candidate of candidates) {
          const candidatePendingFTE = computePendingFromAllocations(
            initialPendingFTE,
            baselineAssignedSlots,
            candidate.allocations
          )
          const candidateDefects = detectRankedV2RepairDefects({
            teamOrder,
            initialPendingFTE,
            pendingFTE: candidatePendingFTE,
            allocations: candidate.allocations,
            pcaPool,
            teamPrefs,
            baselineAllocations: existingAllocations,
          })
          const candidateScore = buildRankedSlotAllocationScore({
            allocations: candidate.allocations,
            initialPendingFTE,
            pendingFTE: candidatePendingFTE,
            teamOrder,
            defects: candidateDefects,
            teamPrefs,
            baselineAllocations: existingAllocations,
            floatingPcaIds,
          })

          if (compareScores(candidateScore, bestScore, RANKED_V2_REPAIR_SCORE_COMPARE_OPTIONS) >= 0) continue
          if (!bestCandidate) {
            bestCandidate = {
              ...candidate,
              score: candidateScore,
              pendingFTE: candidatePendingFTE,
              defects: candidateDefects,
            }
            continue
          }

          const candidateVsBest = compareScores(
            candidateScore,
            bestCandidate.score,
            RANKED_V2_REPAIR_SCORE_COMPARE_OPTIONS
          )
          if (candidateVsBest < 0) {
            bestCandidate = {
              ...candidate,
              score: candidateScore,
              pendingFTE: candidatePendingFTE,
              defects: candidateDefects,
            }
            continue
          }
          if (candidateVsBest === 0 && candidate.sortKey.localeCompare(bestCandidate.sortKey) < 0) {
            bestCandidate = {
              ...candidate,
              score: candidateScore,
              pendingFTE: candidatePendingFTE,
              defects: candidateDefects,
            }
          }
        }
      }

      if (!bestCandidate) break

      allocations.splice(
        0,
        allocations.length,
        ...bestCandidate.allocations.map((allocation) => ({ ...allocation }))
      )
      Object.assign(pendingFTE, bestCandidate.pendingFTE)
      bestScore = bestCandidate.score
      repairAuditDefects = bestCandidate.defects
      setRepairAuditDefects(repairAuditDefects)

      for (const assignment of bestCandidate.repairAssignments) {
        acceptedRepairReasons.set(
          `${assignment.team}:${assignment.pcaId}:${assignment.slot}`,
          bestCandidate.reason === 'P1'
            ? 'ranked-promotion'
            : getRepairReason(bestCandidate.reason as RankedV2RepairDefect['kind'])
        )
      }
    }
  }

  const MAX_OPTIONAL_PROMOTION_ACCEPTS = 8

  const runOptionalRankedPromotionPass = () => {
    let accepted = 0
    while (accepted < MAX_OPTIONAL_PROMOTION_ACCEPTS) {
      repairAuditDefects = detectRankedV2RepairDefects({
        teamOrder,
        initialPendingFTE,
        pendingFTE,
        allocations,
        pcaPool,
        teamPrefs,
        baselineAllocations: existingAllocations,
      })
      if (repairAuditDefects.length > 0) break

      const baseScore = buildRankedSlotAllocationScore({
        allocations,
        initialPendingFTE,
        pendingFTE,
        teamOrder,
        defects: [],
        teamPrefs,
        baselineAllocations: existingAllocations,
        floatingPcaIds,
      })

      const promotionCandidates = generateOptionalPromotionCandidates({
        teamOrder,
        initialPendingFTE,
        pendingFTE,
        allocations,
        pcaPool,
        teamPrefs,
        baselineAllocations: existingAllocations,
        committedStep3Anchors,
      })

      let bestPromotion:
        | (ReturnType<typeof generateOptionalPromotionCandidates>[number] & {
            score: ReturnType<typeof buildRankedSlotAllocationScore>
            pendingFTE: Record<Team, number>
            defects: RankedV2RepairDefect[]
          })
        | null = null

      for (const candidate of promotionCandidates) {
        const candidatePendingFTE = computePendingFromAllocations(
          initialPendingFTE,
          baselineAssignedSlots,
          candidate.allocations
        )
        const candidateDefects = detectRankedV2RepairDefects({
          teamOrder,
          initialPendingFTE,
          pendingFTE: candidatePendingFTE,
          allocations: candidate.allocations,
          pcaPool,
          teamPrefs,
          baselineAllocations: existingAllocations,
        })
        if (candidateDefects.length > 0) continue

        // Constraint 6f: optional promotion must not accept a post-state that would raise Part III `G1`.
        if (
          detectRankedV2GymAvoidableDefects({
            teamOrder,
            initialPendingFTE,
            pendingFTE: candidatePendingFTE,
            allocations: candidate.allocations,
            pcaPool,
            teamPrefs,
            baselineAllocations: existingAllocations,
            committedStep3Anchors,
          }).length > 0
        ) {
          continue
        }

        const candidateScore = buildRankedSlotAllocationScore({
          allocations: candidate.allocations,
          initialPendingFTE,
          pendingFTE: candidatePendingFTE,
          teamOrder,
          defects: candidateDefects,
          teamPrefs,
          baselineAllocations: existingAllocations,
          floatingPcaIds,
        })

        if (compareScores(candidateScore, baseScore, RANKED_V2_PROMOTION_SCORE_COMPARE_OPTIONS) >= 0) {
          continue
        }
        if (!bestPromotion) {
          bestPromotion = {
            ...candidate,
            score: candidateScore,
            pendingFTE: candidatePendingFTE,
            defects: candidateDefects,
          }
          continue
        }
        const vsBest = compareScores(candidateScore, bestPromotion.score, RANKED_V2_PROMOTION_SCORE_COMPARE_OPTIONS)
        if (vsBest < 0) {
          bestPromotion = {
            ...candidate,
            score: candidateScore,
            pendingFTE: candidatePendingFTE,
            defects: candidateDefects,
          }
          continue
        }
        if (vsBest === 0 && candidate.sortKey.localeCompare(bestPromotion.sortKey) < 0) {
          bestPromotion = {
            ...candidate,
            score: candidateScore,
            pendingFTE: candidatePendingFTE,
            defects: candidateDefects,
          }
        }
      }

      if (!bestPromotion) break

      allocations.splice(
        0,
        allocations.length,
        ...bestPromotion.allocations.map((allocation) => ({ ...allocation }))
      )
      Object.assign(pendingFTE, bestPromotion.pendingFTE)
      bestScore = bestPromotion.score
      repairAuditDefects = bestPromotion.defects
      setRepairAuditDefects(repairAuditDefects)

      for (const assignment of bestPromotion.repairAssignments) {
        acceptedRepairReasons.set(
          `${assignment.team}:${assignment.pcaId}:${assignment.slot}`,
          'ranked-promotion'
        )
      }
      accepted += 1
    }
  }

  runRepairLoop()

  runGymAvoidanceRepairLoop({
    teamOrder,
    initialPendingFTE,
    pendingFTE,
    allocations,
    pcaPool,
    teamPrefs,
    baselineAllocations: existingAllocations,
    baselineAssignedSlots,
    committedStep3Anchors,
    maxIterations: MAX_GYM_AVOIDANCE_REPAIR_ITERATIONS_ALLOCATOR,
    onAcceptedMove: (candidate) => {
      for (const assignment of candidate.repairAssignments) {
        acceptedRepairReasons.set(
          `${assignment.team}:${assignment.pcaId}:${assignment.slot}`,
          'gym-avoidance'
        )
      }
    },
  })

  repairAuditDefects = detectRankedV2RepairDefects({
    teamOrder,
    initialPendingFTE,
    pendingFTE,
    allocations,
    pcaPool,
    teamPrefs,
    baselineAllocations: existingAllocations,
  })
  setRepairAuditDefects(repairAuditDefects)
  bestScore = buildRankedSlotAllocationScore({
    allocations,
    initialPendingFTE,
    pendingFTE,
    teamOrder,
    defects: repairAuditDefects,
    teamPrefs,
    baselineAllocations: existingAllocations,
    floatingPcaIds,
  })

  runOptionalRankedPromotionPass()

  // Extra coverage runs between repair passes; a second repair loop re-audits after mutations (f99).
  const applyExtraCoverageRoundRobin = () => {
    if (extraCoverageMode !== 'round-robin-team-order') return

    const allSatisfied = TEAMS.every(
      (team) => roundToNearestQuarterWithMidpoint(pendingFTE[team] ?? 0) < 0.25
    )
    if (!allSatisfied) return

    const zeroPending = TEAMS.reduce((record, team) => {
      record[team] = 0
      return record
    }, {} as Record<Team, number>)

    let madeProgress = true
    while (madeProgress) {
      madeProgress = false
      for (const team of teamOrder) {
        const pref = teamPrefs[team]
        const candidates = findAvailablePCAs({
          pcaPool,
          team,
          teamFloor: pref.teamFloor,
          floorMatch: 'any',
          excludePreferredOfOtherTeams: false,
          preferredPCAIdsOfOtherTeams: new Map<string, Team[]>(),
          pendingFTEPerTeam: zeroPending,
          existingAllocations: allocations,
          gymSlot: pref.gymSlot ?? null,
          avoidGym: pref.avoidGym ?? false,
        })

        if (candidates.length === 0) continue

        const winner = [...candidates].sort((a, b) => {
          const aAllocation = allocations.find((allocation) => allocation.staff_id === a.id)
          const bAllocation = allocations.find((allocation) => allocation.staff_id === b.id)
          const aFte = aAllocation?.fte_remaining ?? a.fte_pca
          const bFte = bAllocation?.fte_remaining ?? b.fte_pca
          if (bFte !== aFte) return bFte - aFte
          return String(a.id).localeCompare(String(b.id))
        })[0]

        const allocation = getOrCreateAllocation(
          winner.id,
          winner.name,
          winner.fte_pca,
          winner.leave_type,
          team,
          allocations
        )

        const extraResult = assignSlotsToTeam({
          pca: winner,
          allocation,
          team,
          pendingFTE: 0.25,
          teamExistingSlots: getTeamExistingSlots(team, allocations),
          gymSlot: pref.gymSlot ?? null,
          avoidGym: pref.avoidGym ?? false,
        })

        if (extraResult.slotsAssigned.length === 0) continue

        madeProgress = true
        for (const slot of extraResult.slotsAssigned) {
          if (slot === 1 || slot === 2 || slot === 3 || slot === 4) {
            const existing = extraCoverageByStaffId[winner.id] ?? []
            existing.push(slot)
            extraCoverageByStaffId[winner.id] = existing
          }
          recordAssignmentWithOrder(team, {
            slot,
            pcaId: winner.id,
            pcaName: winner.name,
            assignedIn: 'step34',
            cycle: 3,
            allocationStage: 'extra-coverage',
            assignmentTag: 'extra',
            wasFloorPCA: isFloorPCAForTeam(winner as PCAData & { floor_pca?: ('upper' | 'lower')[] | null }, pref.teamFloor),
          })
        }
      }
    }
  }

  applyExtraCoverageRoundRobin()
  runRepairLoop()
  applyInvalidSlotPairingForDisplay(allocations, pcaPool)
  const draftAssignmentByKey = new Map<string, SlotAssignmentLog>()
  for (const team of TEAMS) {
    for (const assignment of tracker[team].assignments) {
      draftAssignmentByKey.set(`${team}:${assignment.pcaId}:${assignment.slot}`, assignment)
    }
  }
  const finalTracker = createEmptyTracker()
  for (const team of TEAMS) {
    finalTracker[team].summary.allocationMode = 'standard'
  }
  const recordFinalAssignmentWithOrder = (team: Team, log: Parameters<typeof recordAssignment>[2]) => {
    recordAssignment(finalTracker, team, {
      ...log,
      allocationOrder: allocationOrderMap.get(team),
    })
  }

  const teamSlotCounts = new Map<string, number>()
  for (const allocation of allocations) {
    for (const slot of [1, 2, 3, 4] as const) {
      const team = slot === 1 ? allocation.slot1 : slot === 2 ? allocation.slot2 : slot === 3 ? allocation.slot3 : allocation.slot4
      if (!team) continue
      const key = `${team}:${slot}`
      teamSlotCounts.set(key, (teamSlotCounts.get(key) ?? 0) + 1)
    }
  }
  const baselineOwners = new Map<string, Team | null>()
  for (const allocation of existingAllocations) {
    baselineOwners.set(`${allocation.staff_id}:1`, allocation.slot1)
    baselineOwners.set(`${allocation.staff_id}:2`, allocation.slot2)
    baselineOwners.set(`${allocation.staff_id}:3`, allocation.slot3)
    baselineOwners.set(`${allocation.staff_id}:4`, allocation.slot4)
  }

  const extraCoverageKeys = new Set<string>()
  for (const [pcaId, slots] of Object.entries(extraCoverageByStaffId)) {
    for (const slot of slots) {
      extraCoverageKeys.add(`${pcaId}:${slot}`)
    }
  }
  const pcaById = new Map(pcaPool.map((pca) => [pca.id, pca]))
  const finalAssignmentLogsByKey = new Map<string, { team: Team; log: SlotAssignmentLog }>()

  for (const allocation of [...allocations].sort((a, b) =>
    String(a.staff_id).localeCompare(String(b.staff_id))
  )) {
    const pca = pcaById.get(allocation.staff_id)
    for (const slot of [1, 2, 3, 4] as const) {
      const team = slot === 1 ? allocation.slot1 : slot === 2 ? allocation.slot2 : slot === 3 ? allocation.slot3 : allocation.slot4
      if (!team) continue
      const baselineOwner = baselineOwners.get(`${allocation.staff_id}:${slot}`) ?? null
      if (baselineOwner === team) continue

      const pref = teamPrefs[team]
      const rankIndex = pref.rankedSlots.indexOf(slot)
      const isPreferredPca = pref.preferredPCAIds.includes(allocation.staff_id)
      const isFloorPca = pca
        ? isFloorPCAForTeam(
            pca as PCAData & { floor_pca?: ('upper' | 'lower')[] | null },
            pref.teamFloor
          )
        : undefined
      const duplicateSlot = (teamSlotCounts.get(`${team}:${slot}`) ?? 0) > 1
      const upstreamCoverageKind = upstreamCoverageByTeamSlot.get(`${team}:${slot}`) ?? null
      const repairReason = acceptedRepairReasons.get(`${team}:${allocation.staff_id}:${slot}`)
      const isExtraCoverage = extraCoverageKeys.has(`${allocation.staff_id}:${slot}`)
      const draftAssignment = draftAssignmentByKey.get(`${team}:${allocation.staff_id}:${slot}`)
      const isGymLastResort = pref.avoidGym && pref.gymSlot === slot
      const shouldPreserveDraftMetadata =
        draftAssignment != null && repairReason == null && !isExtraCoverage

      const finalLog: SlotAssignmentLog = shouldPreserveDraftMetadata
        ? {
            ...draftAssignment,
            slot,
            pcaId: allocation.staff_id,
            pcaName: pca?.name ?? allocation.staff_id,
            assignedIn: 'step34',
            step3OwnershipKind: 'step3-floating',
            upstreamCoverageKind,
            allocationStage: 'draft',
            repairReason: null,
            duplicateSlot,
          }
        : {
            slot,
            pcaId: allocation.staff_id,
            pcaName: pca?.name ?? allocation.staff_id,
            assignedIn: 'step34',
            step3OwnershipKind: 'step3-floating',
            upstreamCoverageKind,
            cycle: 3,
            allocationStage: isExtraCoverage ? 'extra-coverage' : repairReason ? 'repair' : 'draft',
            repairReason: repairReason ?? null,
            assignmentTag: isExtraCoverage ? 'extra' : undefined,
            wasPreferredSlot: slot === (pref.preferredSlot ?? -1),
            wasPreferredPCA: isPreferredPca,
            wasFloorPCA: isFloorPca,
            gymSlotAvoided: pref.gymSlot != null ? slot !== pref.gymSlot : undefined,
            fulfilledSlotRank: rankIndex >= 0 ? rankIndex + 1 : null,
            slotSelectionPhase: isGymLastResort
              ? 'gym-last-resort'
              : duplicateSlot && rankIndex >= 0
                ? 'ranked-duplicate'
                : rankIndex >= 0
                  ? 'ranked-unused'
                  : 'unranked-unused',
            pcaSelectionTier: isPreferredPca ? 'preferred' : isFloorPca ? 'floor' : 'non-floor',
            usedContinuity: false,
            duplicateSlot,
          }

      finalAssignmentLogsByKey.set(`${team}:${allocation.staff_id}:${slot}`, { team, log: finalLog })
    }
  }

  const recordedKeys = new Set<string>()
  for (const team of TEAMS) {
    for (const draftAssignment of tracker[team].assignments) {
      const key = `${team}:${draftAssignment.pcaId}:${draftAssignment.slot}`
      const finalAssignment = finalAssignmentLogsByKey.get(key)
      if (!finalAssignment) continue
      if (finalAssignment.log.allocationStage !== 'draft') continue

      recordFinalAssignmentWithOrder(team, finalAssignment.log)
      recordedKeys.add(key)
    }
  }

  for (const [key, finalAssignment] of finalAssignmentLogsByKey.entries()) {
    if (recordedKeys.has(key)) continue
    recordFinalAssignmentWithOrder(finalAssignment.team, finalAssignment.log)
    recordedKeys.add(key)
  }

  for (const team of TEAMS) {
    finalTracker[team].summary.pendingMet =
      roundToNearestQuarterWithMidpoint(pendingFTE[team] ?? 0) < 0.25
    finalTracker[team].summary.repairAuditDefects = []
  }
  for (const defect of repairAuditDefects) {
    const current = finalTracker[defect.team].summary.repairAuditDefects ?? []
    if (!current.includes(defect.kind)) {
      current.push(defect.kind)
    }
    finalTracker[defect.team].summary.repairAuditDefects = current
  }
  finalizeRankedSlotFloatingTracker(finalTracker)

  return {
    allocations,
    pendingPCAFTEPerTeam: pendingFTE,
    tracker: finalTracker,
    extraCoverageByStaffId:
      Object.keys(extraCoverageByStaffId).length > 0 ? extraCoverageByStaffId : undefined,
    errors: undefined,
  }
}
