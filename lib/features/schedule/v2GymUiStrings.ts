/**
 * Canonical user-facing copy for V2 gym provenance (PCA tracker tooltips + Step 3.4).
 * Part III / design: single source of truth — do not re-literal these strings in consumers.
 */

/** Slot path / phase: assignment used the gym as last-resort selection. */
export const V2_GYM_UI_LAST_RESORT_SLOT_PATH = 'Gym (last resort)'

/** Repair reason when Part III gym-avoidance repair updated an assignment. */
export const V2_GYM_UI_AVOIDANCE_REPAIR_APPLIED = 'Gym avoidance repair'

/**
 * Short headline when avoid-gym is on but the team still ended on the gym (true last resort).
 * Used in tracker Status subvalue and Step 3.4 slot detail before PCA name.
 */
export const V2_GYM_UI_UNAVOIDABLE_GYM_SHORT = 'Gym used only as last resort'

/**
 * Step 3.4 slot card result line for gym last resort (matches {@link V2_GYM_UI_LAST_RESORT_SLOT_PATH} + actor).
 */
export function v2GymLastResortResultLineWithActor(pcaDisplayName: string): string {
  return `${V2_GYM_UI_LAST_RESORT_SLOT_PATH} · ${pcaDisplayName}`
}

export function v2GymUnavoidableDetailWithActor(pcaDisplayName: string): string {
  return `${V2_GYM_UI_UNAVOIDABLE_GYM_SHORT} (${pcaDisplayName})`
}

/** Narrative when avoid-gym is on but no non-gym feasible path remained. */
export const V2_GYM_UI_UNAVOIDABLE_GYM_LONG =
  'Gym was used only because no non-gym path remained.'
