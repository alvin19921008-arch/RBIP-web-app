/**
 * AM/PM session balance helpers (Constraint 6d / Task Group D).
 *
 * Session bands (single module): slots **1–2** → band **A**, **3–4** → band **B**.
 *
 * Tiering uses **pending floating quarter count** per team, aligned with `scoreSchedule`:
 * `Math.round((pendingFte + 1e-9) / 0.25)`.
 *
 * Exported scores are **higher-is-better** for lexicographic use in `compareScores`:
 * - **Neutral AM/PM** (`spreadScore === 0` and `detailScore === 0`): quarter counts **1**, **4**, or **≥5**
 *   — no artificial band preference; any placement ties at these fields.
 * - **q = 2** (0.5 FTE): `spreadScore` prefers **1+1** (both bands used) over **2+0** / **0+2**;
 *   `detailScore` breaks ties among **1+1** layouts deterministically.
 * - **q = 3** (0.75 FTE): `spreadScore` prefers **2+1** (both bands used) over **3+0**;
 *   `detailScore` breaks ties among **2+1** histograms deterministically.
 *
 * **Not** used to distinguish single-PCA non-split vs A+B splits — those live in `splitPenalty` /
 * `duplicateFloatingCount` per design.
 *
 * Band counts consume the **per-team assigned slot multiset** passed in (`assignedSlots`). In
 * `buildRankedSlotAllocationScore`, when [floatingPcaIds] is set (allocator always passes it), that
 * multiset is **floating PCA rows only** — non-floating / Step-2 coverage on the same team does not
 * affect AM/PM. **Baseline subtraction** (true Step-3–owned, as in promotion metrics) is **not**
 * applied here; session balance is a placement-shape tie-break on floating-assigned quarters only.
 */

export type SessionBand = 'A' | 'B'

const AM_SLOTS = new Set([1, 2])
const PM_SLOTS = new Set([3, 4])

export function slotSessionBand(slot: number): SessionBand {
  if (AM_SLOTS.has(slot)) return 'A'
  if (PM_SLOTS.has(slot)) return 'B'
  throw new RangeError(`slotSessionBand: unsupported slot ${slot}`)
}

export function pendingFloatingQuarterCount(pendingFte: number): number {
  return Math.round((pendingFte + 1e-9) / 0.25)
}

export function countAssignedSlotsBySessionBand(assignedSlots: readonly number[]): {
  bandA: number
  bandB: number
} {
  let bandA = 0
  let bandB = 0
  for (const slot of assignedSlots) {
    if (AM_SLOTS.has(slot)) bandA += 1
    else if (PM_SLOTS.has(slot)) bandB += 1
  }
  return { bandA, bandB }
}

export type AmPmSessionBalanceTeamScores = {
  spreadScore: number
  detailScore: number
}

/**
 * Per-team AM/PM session-balance tuple for ranked V2 scoring.
 *
 * `initialPendingFte` is the team's **Step 3.4 entry** pending floating FTE used to pick the tier.
 * `assignedSlots` lists each **quarter slot** the team occupies (same cardinality semantics as
 * `scoreSchedule.getAssignedSlotsForTeam`).
 */
export function computeAmPmSessionBalanceTeamScores(
  initialPendingFte: number,
  assignedSlots: readonly number[]
): AmPmSessionBalanceTeamScores {
  const q = pendingFloatingQuarterCount(initialPendingFte)
  const { bandA, bandB } = countAssignedSlotsBySessionBand(assignedSlots)
  const minBand = Math.min(bandA, bandB)

  if (q <= 0 || q === 1 || q === 4 || q >= 5) {
    return { spreadScore: 0, detailScore: 0 }
  }

  if (q === 2) {
    const spreadScore = minBand >= 1 ? 1 : 0
    const detailScore = spreadScore === 1 ? bandA * 10 + bandB : 0
    return { spreadScore, detailScore }
  }

  if (q === 3) {
    const spreadScore = minBand >= 1 ? 1 : 0
    const detailScore = spreadScore === 1 ? bandA * 100 + bandB : 0
    return { spreadScore, detailScore }
  }

  return { spreadScore: 0, detailScore: 0 }
}
