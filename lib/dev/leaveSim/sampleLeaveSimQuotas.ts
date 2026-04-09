import { createRng, pickWeighted, randChoice, randInt, type Rng } from '@/lib/dev/leaveSim/rng'
import type { DevLeaveSimConfig } from '@/lib/dev/leaveSim/types'

/**
 * Separate stream from `createRng(config.seed)` used in `generateDevLeaveSimDraft`.
 * Prevents quota draws from consuming the same PRNG sequence as patch generation.
 */
const QUOTA_STREAM_MARKER = '\nleave-sim:quotas-v1'

export function createLeaveSimQuotaRng(masterSeed: string): Rng {
  return createRng(`${masterSeed}${QUOTA_STREAM_MARKER}`)
}

/**
 * Higher weight for lower sick counts (tends toward ~0–3 when max is 6).
 */
function sickWeightForValue(value: number): number {
  if (value <= 0) return 6
  if (value === 1) return 5
  if (value === 2) return 4.5
  if (value === 3) return 3.5
  if (value === 4) return 1.5
  if (value === 5) return 1.1
  return 1
}

/**
 * When sick load is high relative to [sickMin, sickMax], cap urgent so rare "sick 5 + urgent 2" combos.
 */
function effectiveUrgentUpperBound(args: {
  sick: number
  sickMin: number
  sickMax: number
  urgentMin: number
  urgentMax: number
}): number {
  const { sick, sickMin, sickMax, urgentMin, urgentMax } = args
  if (urgentMax < urgentMin) return urgentMin
  const span = sickMax - sickMin
  const t = span > 0 ? (sick - sickMin) / span : 0
  let suggested = urgentMax
  if (t >= 0.66) suggested = 0
  else if (t >= 0.48) suggested = Math.min(1, urgentMax)
  return Math.max(urgentMin, Math.min(urgentMax, suggested))
}

export type LeaveSimQuotaSample = {
  plannedTherapistCount: number
  plannedPcaFteBudget: number
  sickCount: number
  urgentCount: number
}

/**
 * Deterministic quota roll for Developer Leave Sim (therapist / PCA budget / sick / urgent).
 * Uses a seed-derived stream independent of the draft generator's RNG.
 */
export function sampleLeaveSimQuotas(args: { config: DevLeaveSimConfig; masterSeed: string }): LeaveSimQuotaSample {
  const rng = createLeaveSimQuotaRng(args.masterSeed)
  const c = args.config

  const therapistMin = Math.max(0, Math.floor(c.plannedTherapistMin))
  const therapistMax = Math.max(therapistMin, Math.floor(c.plannedTherapistMax))
  const plannedTherapistCount = randInt(rng, therapistMin, therapistMax)

  const pcaMin = Math.max(0, c.plannedPcaFteBudgetMin)
  const pcaMax = Math.max(pcaMin, c.plannedPcaFteBudgetMax)
  const pcaBudgetChoices = [0, 0.5, 1.0, 1.5, 2.0].filter((v) => v >= pcaMin && v <= pcaMax)
  const plannedPcaFteBudget =
    pcaBudgetChoices.length > 0 ? (randChoice(rng, pcaBudgetChoices) ?? pcaMin) : pcaMin

  const sickMin = Math.max(0, Math.floor(c.sickCountMin))
  const sickMax = Math.max(sickMin, Math.floor(c.sickCountMax))
  const sickOptions: Array<{ value: number; weight: number }> = []
  for (let v = sickMin; v <= sickMax; v++) {
    sickOptions.push({ value: v, weight: sickWeightForValue(v) })
  }
  const sickCount = pickWeighted(rng, sickOptions) ?? sickMin

  const urgentMin = Math.max(0, Math.floor(c.urgentCountMin))
  const urgentMax = Math.max(urgentMin, Math.floor(c.urgentCountMax))
  const urgentUpper = effectiveUrgentUpperBound({
    sick: sickCount,
    sickMin,
    sickMax,
    urgentMin,
    urgentMax,
  })
  const urgentCount = randInt(rng, urgentMin, urgentUpper)

  return {
    plannedTherapistCount,
    plannedPcaFteBudget,
    sickCount,
    urgentCount,
  }
}
