-- copy_schedule_v1: setup-only copy + drop SPT therapist allocations
--
-- Rationale:
-- - "Full copy" has been removed from the app UI. Copy now behaves like the former "hybrid" mode:
--   copies Step 1 + selected Step 2 outputs only, and resets Step 3+ derived outputs.
-- - SPT therapist allocations are weekday-specific and must NOT be copied across dates.
-- - Bed allocations / calculations are derived from Step 2+ outputs and must be regenerated.
--
-- Backward compatibility:
-- - We keep the function signature (including `mode`) so older clients don't break.
-- - `mode` is ignored; behavior is always setup-only.
CREATE OR REPLACE FUNCTION public.copy_schedule_v1(
  from_schedule_id uuid,
  to_schedule_id uuid,
  mode text,
  include_buffer_staff boolean,
  baseline_snapshot jsonb,
  staff_overrides jsonb,
  workflow_state jsonb,
  tie_break_decisions jsonb,
  buffer_staff_ids uuid[] DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- Clear target tables
  DELETE FROM schedule_therapist_allocations WHERE schedule_id = to_schedule_id;
  DELETE FROM schedule_pca_allocations WHERE schedule_id = to_schedule_id;
  DELETE FROM schedule_bed_allocations WHERE schedule_id = to_schedule_id;
  DELETE FROM schedule_calculations WHERE schedule_id = to_schedule_id;
  -- Legacy-safe: unmet-needs tracking table may not exist in some deployments.
  IF to_regclass('public.pca_unmet_needs_tracking') IS NOT NULL THEN
    DELETE FROM pca_unmet_needs_tracking WHERE schedule_id = to_schedule_id;
  END IF;

  -- Therapist allocations (copied, but EXCLUDE SPT)
  INSERT INTO schedule_therapist_allocations (
    schedule_id,
    staff_id,
    team,
    fte_therapist,
    fte_remaining,
    slot_whole,
    slot1,
    slot2,
    slot3,
    slot4,
    leave_type,
    special_program_ids,
    is_substitute_team_head,
    spt_slot_display,
    is_manual_override,
    manual_override_note
  )
  SELECT
    to_schedule_id,
    a.staff_id,
    a.team,
    a.fte_therapist,
    a.fte_remaining,
    a.slot_whole,
    a.slot1,
    a.slot2,
    a.slot3,
    a.slot4,
    a.leave_type,
    a.special_program_ids,
    a.is_substitute_team_head,
    a.spt_slot_display,
    a.is_manual_override,
    a.manual_override_note
  FROM schedule_therapist_allocations a
  LEFT JOIN staff s ON s.id = a.staff_id
  WHERE a.schedule_id = from_schedule_id
    AND (
      include_buffer_staff
      OR buffer_staff_ids IS NULL
      OR NOT (a.staff_id = ANY(buffer_staff_ids))
    )
    AND COALESCE(s.rank, '') <> 'SPT';

  -- PCA allocations (setup-only): non-floating + special-program + substitution PCAs
  WITH substitution_ids AS (
    SELECT (e.key)::uuid AS staff_id
    FROM jsonb_each(COALESCE(staff_overrides, '{}'::jsonb)) AS e(key, value)
    WHERE (e.value ? 'substitutionFor')
  )
  INSERT INTO schedule_pca_allocations (
    schedule_id,
    staff_id,
    team,
    fte_pca,
    fte_remaining,
    slot_assigned,
    slot_whole,
    slot1,
    slot2,
    slot3,
    slot4,
    leave_type,
    special_program_ids,
    invalid_slot
  )
  SELECT
    to_schedule_id,
    a.staff_id,
    a.team,
    a.fte_pca,
    a.fte_remaining,
    a.slot_assigned,
    a.slot_whole,
    a.slot1,
    a.slot2,
    a.slot3,
    a.slot4,
    a.leave_type,
    a.special_program_ids,
    a.invalid_slot
  FROM schedule_pca_allocations a
  LEFT JOIN staff s ON s.id = a.staff_id
  WHERE a.schedule_id = from_schedule_id
    AND (
      include_buffer_staff
      OR buffer_staff_ids IS NULL
      OR NOT (a.staff_id = ANY(buffer_staff_ids))
    )
    AND (
      COALESCE(s.floating, false) = false
      OR (a.special_program_ids IS NOT NULL AND array_length(a.special_program_ids, 1) > 0)
      OR a.staff_id IN (SELECT staff_id FROM substitution_ids)
    );

  -- NOTE: We intentionally do NOT copy bed allocations or calculations.
  -- They are derived from Step 2+ outputs and must be regenerated after copy.

  -- Update target schedule metadata
  UPDATE daily_schedules
  SET
    is_tentative = true,
    baseline_snapshot = COALESCE(copy_schedule_v1.baseline_snapshot, '{}'::jsonb),
    staff_overrides = COALESCE(copy_schedule_v1.staff_overrides, '{}'::jsonb),
    workflow_state = COALESCE(copy_schedule_v1.workflow_state, '{}'::jsonb),
    tie_break_decisions = COALESCE(copy_schedule_v1.tie_break_decisions, '{}'::jsonb)
  WHERE daily_schedules.id = to_schedule_id;
END;
$$;

