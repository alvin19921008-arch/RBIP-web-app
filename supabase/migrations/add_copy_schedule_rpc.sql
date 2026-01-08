-- copy_schedule_v1: server-side transactional copy for schedules.
--
-- This function:
-- - Clears target allocations/calculations/unmet-needs
-- - Copies allocations from source to target (full or hybrid mode)
-- - Optionally excludes buffer staff allocations (based on staff.status = 'buffer')
-- - Updates target schedule metadata (baseline_snapshot, staff_overrides, workflow_state, tie_break_decisions)
--
-- Notes:
-- - Runs with SECURITY INVOKER (default) so RLS policies still apply
-- - Target schedule row must already exist

CREATE OR REPLACE FUNCTION public.copy_schedule_v1(
  from_schedule_id uuid,
  to_schedule_id uuid,
  mode text,
  include_buffer_staff boolean,
  baseline_snapshot jsonb,
  staff_overrides jsonb,
  workflow_state jsonb,
  tie_break_decisions jsonb
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  is_full boolean;
BEGIN
  is_full := (mode = 'full');

  -- Clear target tables
  DELETE FROM schedule_therapist_allocations WHERE schedule_id = to_schedule_id;
  DELETE FROM schedule_pca_allocations WHERE schedule_id = to_schedule_id;
  DELETE FROM schedule_bed_allocations WHERE schedule_id = to_schedule_id;
  DELETE FROM schedule_calculations WHERE schedule_id = to_schedule_id;
  -- Legacy-safe: unmet-needs tracking table may not exist in some deployments.
  IF to_regclass('public.pca_unmet_needs_tracking') IS NOT NULL THEN
    DELETE FROM pca_unmet_needs_tracking WHERE schedule_id = to_schedule_id;
  END IF;

  -- Therapist allocations (always copied)
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
      OR COALESCE(s.status, 'active') <> 'buffer'
    );

  -- PCA allocations
  IF is_full THEN
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
      invalid_slot,
      leave_comeback_time,
      leave_mode
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
      a.invalid_slot,
      a.leave_comeback_time,
      a.leave_mode
    FROM schedule_pca_allocations a
    LEFT JOIN staff s ON s.id = a.staff_id
    WHERE a.schedule_id = from_schedule_id
      AND (
        include_buffer_staff
        OR COALESCE(s.status, 'active') <> 'buffer'
      );
  ELSE
    -- Hybrid: non-floating + special-program + substitution PCAs
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
      invalid_slot,
      leave_comeback_time,
      leave_mode
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
      a.invalid_slot,
      a.leave_comeback_time,
      a.leave_mode
    FROM schedule_pca_allocations a
    LEFT JOIN staff s ON s.id = a.staff_id
    WHERE a.schedule_id = from_schedule_id
      AND (
        include_buffer_staff
        OR COALESCE(s.status, 'active') <> 'buffer'
      )
      AND (
        COALESCE(s.floating, false) = false
        OR (a.special_program_ids IS NOT NULL AND array_length(a.special_program_ids, 1) > 0)
        OR a.staff_id IN (SELECT staff_id FROM substitution_ids)
      );
  END IF;

  -- Bed allocations + calculations only for full copy
  IF is_full THEN
    INSERT INTO schedule_bed_allocations (schedule_id, from_team, to_team, ward, num_beds, slot)
    SELECT to_schedule_id, a.from_team, a.to_team, a.ward, a.num_beds, a.slot
    FROM schedule_bed_allocations a
    WHERE a.schedule_id = from_schedule_id;

    INSERT INTO schedule_calculations (
      schedule_id,
      team,
      designated_wards,
      total_beds_designated,
      total_beds,
      total_pt_on_duty,
      beds_per_pt,
      pt_per_team,
      beds_for_relieving,
      pca_on_duty,
      total_pt_per_pca,
      total_pt_per_team,
      average_pca_per_team
    )
    SELECT
      to_schedule_id,
      c.team,
      c.designated_wards,
      c.total_beds_designated,
      c.total_beds,
      c.total_pt_on_duty,
      c.beds_per_pt,
      c.pt_per_team,
      c.beds_for_relieving,
      c.pca_on_duty,
      c.total_pt_per_pca,
      c.total_pt_per_team,
      c.average_pca_per_team
    FROM schedule_calculations c
    WHERE c.schedule_id = from_schedule_id;
  END IF;

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

