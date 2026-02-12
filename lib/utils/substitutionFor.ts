import type { Team } from '@/types/staff'

export type SubstitutionForEntry = {
  nonFloatingPCAId: string
  nonFloatingPCAName: string
  team: Team
  slots: number[]
}

export type SubstitutionForBySlotEntry = {
  nonFloatingPCAId: string
  nonFloatingPCAName: string
  team: Team
}

export type SubstitutionForBySlot = Partial<Record<1 | 2 | 3 | 4, SubstitutionForBySlotEntry>>

function isSlot(x: number): x is 1 | 2 | 3 | 4 {
  return x === 1 || x === 2 || x === 3 || x === 4
}

export function normalizeSubstitutionForBySlot(
  override: {
    substitutionFor?: SubstitutionForEntry
    substitutionForBySlot?: SubstitutionForBySlot
  } | null | undefined
): SubstitutionForBySlot {
  const bySlot: SubstitutionForBySlot = {}

  const raw = override?.substitutionForBySlot
  if (raw && typeof raw === 'object') {
    for (const slot of [1, 2, 3, 4] as const) {
      const entry = (raw as any)?.[slot]
      if (!entry || typeof entry !== 'object') continue
      if (typeof entry.team !== 'string' || typeof entry.nonFloatingPCAId !== 'string') continue
      bySlot[slot] = {
        team: entry.team as Team,
        nonFloatingPCAId: entry.nonFloatingPCAId,
        nonFloatingPCAName: typeof entry.nonFloatingPCAName === 'string' ? entry.nonFloatingPCAName : '',
      }
    }
  }

  const legacy = override?.substitutionFor
  if (legacy && Array.isArray(legacy.slots)) {
    for (const s of legacy.slots) {
      if (!isSlot(s)) continue
      if (bySlot[s]) continue
      bySlot[s] = {
        team: legacy.team,
        nonFloatingPCAId: legacy.nonFloatingPCAId,
        nonFloatingPCAName: legacy.nonFloatingPCAName,
      }
    }
  }

  return bySlot
}

export function getAllSubstitutionSlots(
  override: {
    substitutionFor?: SubstitutionForEntry
    substitutionForBySlot?: SubstitutionForBySlot
  } | null | undefined
): number[] {
  const bySlot = normalizeSubstitutionForBySlot(override)
  return ([1, 2, 3, 4] as const).filter((slot) => !!bySlot[slot])
}

export function getSubstitutionSlotsForTeam(
  override: {
    substitutionFor?: SubstitutionForEntry
    substitutionForBySlot?: SubstitutionForBySlot
  } | null | undefined,
  team: Team
): number[] {
  const bySlot = normalizeSubstitutionForBySlot(override)
  return ([1, 2, 3, 4] as const).filter((slot) => bySlot[slot]?.team === team)
}

export function hasAnySubstitution(
  override: {
    substitutionFor?: SubstitutionForEntry
    substitutionForBySlot?: SubstitutionForBySlot
  } | null | undefined
): boolean {
  return getAllSubstitutionSlots(override).length > 0
}

export function deriveLegacySubstitutionFor(
  bySlot: SubstitutionForBySlot
): SubstitutionForEntry | undefined {
  const slots = ([1, 2, 3, 4] as const).filter((slot) => !!bySlot[slot])
  if (slots.length === 0) return undefined

  const first = bySlot[slots[0]]!
  const allSame = slots.every((slot) => {
    const entry = bySlot[slot]
    return (
      !!entry &&
      entry.team === first.team &&
      entry.nonFloatingPCAId === first.nonFloatingPCAId &&
      entry.nonFloatingPCAName === first.nonFloatingPCAName
    )
  })
  if (!allSame) return undefined

  return {
    team: first.team,
    nonFloatingPCAId: first.nonFloatingPCAId,
    nonFloatingPCAName: first.nonFloatingPCAName,
    slots: [...slots],
  }
}

export function applySubstitutionSlotsToOverride(args: {
  existingOverride: any
  team: Team
  nonFloatingPCAId: string
  nonFloatingPCAName: string
  slots: number[]
}): any {
  const next = { ...(args.existingOverride ?? {}) }
  const bySlot = normalizeSubstitutionForBySlot(next)

  for (const s of args.slots) {
    if (!isSlot(s)) continue
    bySlot[s] = {
      team: args.team,
      nonFloatingPCAId: args.nonFloatingPCAId,
      nonFloatingPCAName: args.nonFloatingPCAName,
    }
  }

  next.substitutionForBySlot = bySlot
  const legacy = deriveLegacySubstitutionFor(bySlot)
  if (legacy) next.substitutionFor = legacy
  else delete next.substitutionFor
  return next
}

export function removeSubstitutionForTeamsFromOverride(args: {
  override: any
  teams: Set<Team>
}): any {
  const next = { ...(args.override ?? {}) }
  const bySlot = normalizeSubstitutionForBySlot(next)
  let changed = false

  for (const slot of [1, 2, 3, 4] as const) {
    const entry = bySlot[slot]
    if (!entry) continue
    if (!args.teams.has(entry.team)) continue
    delete bySlot[slot]
    changed = true
  }

  if (!changed) return next
  const remainingSlots = ([1, 2, 3, 4] as const).filter((slot) => !!bySlot[slot])
  if (remainingSlots.length === 0) {
    delete next.substitutionForBySlot
    delete next.substitutionFor
    return next
  }

  next.substitutionForBySlot = bySlot
  const legacy = deriveLegacySubstitutionFor(bySlot)
  if (legacy) next.substitutionFor = legacy
  else delete next.substitutionFor
  return next
}

export function removeSubstitutionForTargetsFromOverride(args: {
  override: any
  targets: Set<string> // `${team}::${nonFloatingPCAId}`
}): any {
  const next = { ...(args.override ?? {}) }
  const bySlot = normalizeSubstitutionForBySlot(next)
  let changed = false

  for (const slot of [1, 2, 3, 4] as const) {
    const entry = bySlot[slot]
    if (!entry) continue
    const tag = `${entry.team}::${entry.nonFloatingPCAId}`
    if (!args.targets.has(tag)) continue
    delete bySlot[slot]
    changed = true
  }

  if (!changed) return next
  const remainingSlots = ([1, 2, 3, 4] as const).filter((slot) => !!bySlot[slot])
  if (remainingSlots.length === 0) {
    delete next.substitutionForBySlot
    delete next.substitutionFor
    return next
  }

  next.substitutionForBySlot = bySlot
  const legacy = deriveLegacySubstitutionFor(bySlot)
  if (legacy) next.substitutionFor = legacy
  else delete next.substitutionFor
  return next
}
